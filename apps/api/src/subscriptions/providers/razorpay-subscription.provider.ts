import { BadRequestException, Injectable } from '@nestjs/common';
import { SubPeriod, SubStatus } from '@prisma/client';
import { createHmac } from 'crypto';

export interface CreateProviderSubscriptionInput {
  planId: string;
  tenantId: string;
  userId: string;
  amountInr: number;
  currency: string;
  period: SubPeriod;
}

export interface ProviderSubscriptionResult {
  providerSubId: string;
  status: SubStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

@Injectable()
export class RazorpaySubscriptionProvider {
  async createSubscription(input: CreateProviderSubscriptionInput): Promise<ProviderSubscriptionResult> {
    const now = new Date();

    // In dev/test we simulate provider creation while preserving provider IDs and billing periods.
    return {
      providerSubId: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      status: SubStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: this.addPeriod(now, input.period),
    };
  }

  verifyWebhookSignature(payload: Record<string, unknown>, signature?: string) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

    if (!secret) {
      if (isProd) {
        throw new BadRequestException('Razorpay webhook secret not configured');
      }
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing Razorpay webhook signature');
    }

    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    if (expected !== signature) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }
  }

  mapWebhookStatus(status: string): SubStatus {
    const normalized = status.toUpperCase();
    if (normalized === 'ACTIVE') return SubStatus.ACTIVE;
    if (normalized === 'IN_GRACE') return SubStatus.IN_GRACE;
    if (normalized === 'PAST_DUE') return SubStatus.PAST_DUE;
    if (normalized === 'CANCELED') return SubStatus.CANCELED;
    if (normalized === 'EXPIRED') return SubStatus.EXPIRED;
    return SubStatus.PENDING;
  }

  private addPeriod(start: Date, period: SubPeriod) {
    const end = new Date(start);
    if (period === SubPeriod.MONTHLY) {
      end.setMonth(end.getMonth() + 1);
      return end;
    }
    if (period === SubPeriod.QUARTERLY) {
      end.setMonth(end.getMonth() + 3);
      return end;
    }
    end.setFullYear(end.getFullYear() + 1);
    return end;
  }
}
