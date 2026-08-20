import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEventKey, Prisma, RechargeOrderStatus } from '../generated/prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly notifications: NotificationsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async listPlans() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const plans = await this.prisma.billingPlan.findMany({
      where: {
        active: true,
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'desc' }, { amountInr: 'asc' }],
      take: 100,
    });

    return plans.map(plan => ({
      id: plan.id,
      amountInr: plan.amountInr,
      credits: plan.credits,
      bonus: plan.bonus,
      active: plan.active,
    }));
  }

  async createRechargeOrder(userId: string, planId: string, idempotencyKey: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const existing = await this.idempotency.findExisting(idempotencyKey, tenantId, userId);
    if (existing) {
      return {
        ...(existing.body as Record<string, unknown>),
        idempotent: true,
      };
    }

    const plan = await this.prisma.billingPlan.findFirst({
      where: {
        id: planId,
        active: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const providerOrderId = `order_${randomUUID().replaceAll('-', '')}`;

    const order = await this.prisma.rechargeOrder.create({
      data: {
        tenantId,
        userId,
        providerOrderId,
        status: RechargeOrderStatus.CREATED,
        amountInr: plan.amountInr,
        amountPaise: plan.amountInr * 100,
        credits: plan.credits,
        bonusCredits: plan.bonus,
        currency: 'INR',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'wallet.recharge.order_created',
        entityType: 'recharge_order',
        entityId: order.id,
        after: {
          planId: plan.id,
          providerOrderId,
          amountInr: plan.amountInr,
          credits: plan.credits,
          bonus: plan.bonus,
        } as Prisma.InputJsonValue,
      },
    });

    const response = {
      orderId: order.id,
      providerOrderId: order.providerOrderId,
      amountInr: order.amountInr,
      amountPaise: order.amountPaise,
      credits: order.credits,
      bonusCredits: order.bonusCredits,
      currency: order.currency,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_mock',
      idempotent: false,
    };

    await this.idempotency.save(
      {
        key: idempotencyKey,
        tenantId,
        userId,
        method: 'POST',
        path: '/wallet/recharge/order',
        body: { planId },
      },
      201,
      response as unknown as Record<string, unknown>,
    );

    return response;
  }

  async confirmRechargeOrder(
    userId: string,
    input: { orderId: string; paymentId: string; signature?: string },
    idempotencyKey: string,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const existing = await this.idempotency.findExisting(idempotencyKey, tenantId, userId);
    if (existing) {
      return {
        ...(existing.body as Record<string, unknown>),
        idempotent: true,
      };
    }

    const order = await this.prisma.rechargeOrder.findFirst({
      where: { id: input.orderId, tenantId, userId },
    });

    if (!order) {
      throw new NotFoundException('Recharge order not found');
    }

    if (order.status === RechargeOrderStatus.PAID) {
      const balance = await this.getBalance(tenantId, userId);
      return {
        success: true,
        orderId: order.id,
        status: order.status,
        balance,
        idempotent: true,
      };
    }

    this.verifySignature(order.providerOrderId, input.paymentId, input.signature);

    const result = await this.prisma.$transaction(async tx => {
      const updated = await tx.rechargeOrder.update({
        where: { id: order.id },
        data: {
          status: RechargeOrderStatus.PAID,
          providerPaymentId: input.paymentId,
          paidAt: new Date(),
          rawPayload: {
            paymentId: input.paymentId,
            signature: input.signature ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      const totalCredits = updated.credits + updated.bonusCredits;
      await tx.walletTransaction.create({
        data: {
          tenantId,
          userId,
          type: 'CREDIT',
          amount: totalCredits,
          summary: `Recharge successful: INR ${updated.amountInr}`,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: 'wallet.recharge.paid',
          entityType: 'recharge_order',
          entityId: updated.id,
          after: {
            paymentId: input.paymentId,
            credits: updated.credits,
            bonusCredits: updated.bonusCredits,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

    const balance = await this.getBalance(tenantId, userId);

    await this.notifications.emit({
      tenantId,
      userId,
      eventKey: NotificationEventKey.RECHARGE_SUCCESS,
      title: 'Recharge successful',
      body: `Your wallet was credited with ${result.credits + result.bonusCredits} credits.`,
      metadata: {
        orderId: result.id,
        paymentId: input.paymentId,
        amountInr: result.amountInr,
      } as Prisma.InputJsonValue,
    });

    const response = {
      success: true,
      orderId: result.id,
      status: result.status,
      balance,
      credited: result.credits + result.bonusCredits,
      idempotent: false,
    };

    await this.idempotency.save(
      {
        key: idempotencyKey,
        tenantId,
        userId,
        method: 'POST',
        path: '/wallet/recharge/confirm',
        body: input as unknown as Record<string, unknown>,
      },
      200,
      response as unknown as Record<string, unknown>,
    );

    return response;
  }

  private verifySignature(providerOrderId: string, paymentId: string, signature?: string) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

    if (!secret) {
      if (isDev) return;
      throw new BadRequestException('Razorpay secret not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing payment signature');
    }

    const expected = createHmac('sha256', secret)
      .update(`${providerOrderId}|${paymentId}`)
      .digest('hex');

    if (expected !== signature) {
      throw new BadRequestException('Invalid payment signature');
    }
  }

  private async getBalance(tenantId: string, userId: string) {
    const balanceAgg = await this.prisma.walletTransaction.aggregate({
      where: { tenantId, userId },
      _sum: { amount: true },
    });
    return balanceAgg._sum.amount ?? 0;
  }
}
