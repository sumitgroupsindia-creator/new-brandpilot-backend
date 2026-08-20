import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigKeys } from '@brandpilot/shared';
import { Prisma, SubStatus } from '../generated/prisma/client';
import { ConfigService } from '../config/config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { RazorpaySubscriptionProvider } from './providers/razorpay-subscription.provider';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
    private readonly configService: ConfigService,
    private readonly provider: RazorpaySubscriptionProvider,
  ) {}

  async listPlans() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        active: true,
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'desc' }, { displayOrder: 'asc' }, { amountInr: 'asc' }],
      take: 100,
    });

    return plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      amountInr: plan.amountInr,
      currency: plan.currency,
      period: plan.period,
      premiumFrames: plan.premiumFrames,
      monthlyCredits: plan.monthlyCredits,
      graceDays: plan.graceDays,
      active: plan.active,
    }));
  }

  async getMySubscription(userId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return null;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        userId,
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!subscription) return null;

    return {
      id: subscription.id,
      status: subscription.status,
      providerSubId: subscription.providerSubId,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        amountInr: subscription.plan.amountInr,
        period: subscription.plan.period,
        premiumFrames: subscription.plan.premiumFrames,
        monthlyCredits: subscription.plan.monthlyCredits,
      },
    };
  }

  async createSubscription(userId: string, planId: string, idempotencyKey: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const existing = await this.idempotency.findExisting(idempotencyKey, tenantId, userId);
    if (existing) {
      return { ...(existing.body as Record<string, unknown>), idempotent: true };
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        id: planId,
        active: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const openSubscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        userId,
        status: { in: [SubStatus.PENDING, SubStatus.ACTIVE, SubStatus.IN_GRACE, SubStatus.PAST_DUE] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (openSubscription) {
      throw new BadRequestException('An active subscription already exists');
    }

    const providerResult = await this.provider.createSubscription({
      planId: plan.id,
      tenantId,
      userId,
      amountInr: plan.amountInr,
      currency: plan.currency,
      period: plan.period,
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        userId,
        planId: plan.id,
        providerSubId: providerResult.providerSubId,
        status: providerResult.status,
        currentPeriodStart: providerResult.currentPeriodStart,
        currentPeriodEnd: providerResult.currentPeriodEnd,
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        eventType: 'subscription.created',
        payload: {
          providerSubId: providerResult.providerSubId,
          amountInr: plan.amountInr,
          period: plan.period,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'subscription.created',
        entityType: 'subscription',
        entityId: subscription.id,
        after: {
          planId: plan.id,
          providerSubId: providerResult.providerSubId,
          status: subscription.status,
        } as Prisma.InputJsonValue,
      },
    });

    const response = {
      subscriptionId: subscription.id,
      providerSubId: subscription.providerSubId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      idempotent: false,
    };

    await this.idempotency.save(
      {
        key: idempotencyKey,
        tenantId,
        userId,
        method: 'POST',
        path: '/subscriptions',
        body: { planId },
      },
      201,
      response as unknown as Record<string, unknown>,
    );

    return response;
  }

  async cancelSubscription(userId: string, idempotencyKey: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const existing = await this.idempotency.findExisting(idempotencyKey, tenantId, userId);
    if (existing) {
      return { ...(existing.body as Record<string, unknown>), idempotent: true };
    }

    const active = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        userId,
        status: { in: [SubStatus.ACTIVE, SubStatus.IN_GRACE, SubStatus.PAST_DUE] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!active) {
      throw new NotFoundException('No active subscription found');
    }

    const updated = await this.prisma.subscription.update({
      where: { id: active.id },
      data: {
        cancelAtPeriodEnd: true,
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: updated.id,
        eventType: 'subscription.cancel_at_period_end',
      },
    });

    const response = {
      subscriptionId: updated.id,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
      idempotent: false,
    };

    await this.idempotency.save(
      {
        key: idempotencyKey,
        tenantId,
        userId,
        method: 'POST',
        path: '/subscriptions/cancel',
        body: {},
      },
      201,
      response as unknown as Record<string, unknown>,
    );

    return response;
  }

  async resumeSubscription(userId: string, idempotencyKey: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const existing = await this.idempotency.findExisting(idempotencyKey, tenantId, userId);
    if (existing) {
      return { ...(existing.body as Record<string, unknown>), idempotent: true };
    }

    const pendingCancel = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        userId,
        cancelAtPeriodEnd: true,
        status: { in: [SubStatus.ACTIVE, SubStatus.IN_GRACE, SubStatus.PAST_DUE] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!pendingCancel) {
      throw new NotFoundException('No cancelable subscription found');
    }

    const updated = await this.prisma.subscription.update({
      where: { id: pendingCancel.id },
      data: { cancelAtPeriodEnd: false },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: updated.id,
        eventType: 'subscription.resumed',
      },
    });

    const response = {
      subscriptionId: updated.id,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
      idempotent: false,
    };

    await this.idempotency.save(
      {
        key: idempotencyKey,
        tenantId,
        userId,
        method: 'POST',
        path: '/subscriptions/resume',
        body: {},
      },
      201,
      response as unknown as Record<string, unknown>,
    );

    return response;
  }

  async hasPremiumAccess(userId: string, tenantId: string) {
    if (await this.isSuperAdmin(userId, tenantId)) {
      return true;
    }

    const enabled = (await this.configService.getBoolean(ConfigKeys.FLAGS_SUBSCRIPTIONS_ENABLED, tenantId)) ?? true;
    if (!enabled) {
      return true;
    }

    const now = new Date();
    const active = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        userId,
        status: { in: [SubStatus.ACTIVE, SubStatus.IN_GRACE] },
        currentPeriodEnd: { gte: now },
        plan: { premiumFrames: true },
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });

    return Boolean(active);
  }

  async shouldPremiumAlsoCostCredits(tenantId: string) {
    return (
      (await this.configService.getBoolean(
        ConfigKeys.BILLING_SUBSCRIPTION_PREMIUM_ALSO_COSTS_CREDITS,
        tenantId,
      )) ?? true
    );
  }

  async isSuperAdmin(userId: string, tenantId: string) {
    if (this.tenantContext.hasRole('SUPER_ADMIN')) {
      return true;
    }

    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          tenantId,
          key: 'SUPER_ADMIN',
        },
      },
      select: { userId: true },
    });

    return Boolean(userRole);
  }

  async handleRazorpaySubscriptionWebhook(
    payload: {
      providerSubId: string;
      eventType: string;
      status: string;
      currentPeriodStart?: string;
      currentPeriodEnd?: string;
      reason?: string;
    },
    signature?: string,
  ) {
    this.provider.verifyWebhookSignature(payload, signature);

    const subscription = await this.prisma.subscription.findUnique({
      where: { providerSubId: payload.providerSubId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const nextStatus = this.provider.mapWebhookStatus(payload.status);
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: nextStatus,
        currentPeriodStart: payload.currentPeriodStart ? new Date(payload.currentPeriodStart) : subscription.currentPeriodStart,
        currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd) : subscription.currentPeriodEnd,
        canceledAt: nextStatus === SubStatus.CANCELED ? new Date() : subscription.canceledAt,
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: updated.id,
        eventType: payload.eventType,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: updated.tenantId,
        actorEmail: 'webhook:razorpay',
        action: 'subscription.webhook.processed',
        entityType: 'subscription',
        entityId: updated.id,
        after: {
          status: updated.status,
          eventType: payload.eventType,
          reason: payload.reason ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      subscriptionId: updated.id,
      status: updated.status,
    };
  }

}
