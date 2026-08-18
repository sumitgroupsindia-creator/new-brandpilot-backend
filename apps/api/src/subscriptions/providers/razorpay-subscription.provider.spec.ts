import { BadRequestException } from '@nestjs/common';
import { SubPeriod, SubStatus } from '@prisma/client';
import { createHmac } from 'crypto';
import { RazorpaySubscriptionProvider } from './razorpay-subscription.provider';

describe('RazorpaySubscriptionProvider', () => {
  const provider = new RazorpaySubscriptionProvider();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RAZORPAY_KEY_SECRET = originalSecret;
  });

  it('creates an ACTIVE subscription with providerSubId', async () => {
    const result = await provider.createSubscription({
      planId: 'plan_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      amountInr: 499,
      currency: 'INR',
      period: SubPeriod.MONTHLY,
    });

    expect(result.status).toBe(SubStatus.ACTIVE);
    expect(result.providerSubId.startsWith('sub_')).toBe(true);
    expect(result.currentPeriodStart.getTime()).toBeLessThanOrEqual(result.currentPeriodEnd.getTime());
  });

  it('allows missing secret in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() => provider.verifyWebhookSignature({ providerSubId: 'sub_1' }, undefined)).not.toThrow();
  });

  it('rejects missing secret in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() => provider.verifyWebhookSignature({ providerSubId: 'sub_1' }, undefined)).toThrow(BadRequestException);
  });

  it('rejects invalid signature when secret is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.RAZORPAY_KEY_SECRET = 'top_secret';

    expect(() => provider.verifyWebhookSignature({ providerSubId: 'sub_1' }, 'invalid')).toThrow(BadRequestException);
  });

  it('accepts valid signature when secret is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.RAZORPAY_KEY_SECRET = 'top_secret';
    const payload = { providerSubId: 'sub_1', status: 'ACTIVE' };
    const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    expect(() => provider.verifyWebhookSignature(payload, signature)).not.toThrow();
  });

  it('maps webhook status values', () => {
    expect(provider.mapWebhookStatus('active')).toBe(SubStatus.ACTIVE);
    expect(provider.mapWebhookStatus('in_grace')).toBe(SubStatus.IN_GRACE);
    expect(provider.mapWebhookStatus('past_due')).toBe(SubStatus.PAST_DUE);
    expect(provider.mapWebhookStatus('canceled')).toBe(SubStatus.CANCELED);
    expect(provider.mapWebhookStatus('expired')).toBe(SubStatus.EXPIRED);
    expect(provider.mapWebhookStatus('unknown')).toBe(SubStatus.PENDING);
  });
});
