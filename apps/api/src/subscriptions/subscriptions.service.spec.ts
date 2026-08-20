import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubPeriod, SubStatus } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  const createService = () => {
    const prisma = {
      subscriptionPlan: { findFirst: jest.fn() },
      subscription: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      subscriptionEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      // isSuperAdmin() falls through to a userRole lookup when hasRole is false.
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;

    // hasRole is used by isSuperAdmin(); without it the fake throws before
    // the premium-access logic under test is ever reached.
    const tenantContext = { getTenantId: jest.fn(), hasRole: jest.fn().mockReturnValue(false) } as any;
    const idempotency = {
      findExisting: jest.fn(),
      save: jest.fn(),
    } as any;
    const configService = { getBoolean: jest.fn() } as any;
    const provider = {
      createSubscription: jest.fn(),
      verifyWebhookSignature: jest.fn(),
      mapWebhookStatus: jest.fn(),
    } as any;

    const service = new SubscriptionsService(prisma, tenantContext, idempotency, configService, provider);
    return { service, prisma, tenantContext, idempotency, configService, provider };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns idempotent response for create when key already exists', async () => {
    const { service, tenantContext, idempotency } = createService();
    tenantContext.getTenantId.mockReturnValue('tenant_1');
    idempotency.findExisting.mockResolvedValue({ status: 201, body: { subscriptionId: 'sub_1' } });

    const result = await service.createSubscription('user_1', 'plan_1', 'key_1');

    expect(result).toEqual({ subscriptionId: 'sub_1', idempotent: true });
  });

  it('creates subscription through provider and saves idempotency', async () => {
    const { service, prisma, tenantContext, idempotency, provider } = createService();
    tenantContext.getTenantId.mockReturnValue('tenant_1');
    idempotency.findExisting.mockResolvedValue(null);
    prisma.subscriptionPlan.findFirst.mockResolvedValue({
      id: 'plan_1',
      amountInr: 499,
      currency: 'INR',
      period: SubPeriod.MONTHLY,
    });
    prisma.subscription.findFirst.mockResolvedValue(null);
    provider.createSubscription.mockResolvedValue({
      providerSubId: 'provider_sub_1',
      status: SubStatus.ACTIVE,
      currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    });
    prisma.subscription.create.mockResolvedValue({
      id: 'sub_1',
      providerSubId: 'provider_sub_1',
      status: SubStatus.ACTIVE,
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    });

    const result = await service.createSubscription('user_1', 'plan_1', 'key_1');

    expect(provider.createSubscription).toHaveBeenCalled();
    expect(result).toMatchObject({
      subscriptionId: 'sub_1',
      providerSubId: 'provider_sub_1',
      status: SubStatus.ACTIVE,
      idempotent: false,
    });
    expect(idempotency.save).toHaveBeenCalled();
  });

  it('requires tenant context for cancel', async () => {
    const { service, tenantContext } = createService();
    tenantContext.getTenantId.mockReturnValue(null);

    await expect(service.cancelSubscription('user_1', 'key_1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('supports idempotent cancel responses', async () => {
    const { service, tenantContext, idempotency } = createService();
    tenantContext.getTenantId.mockReturnValue('tenant_1');
    idempotency.findExisting.mockResolvedValue({ status: 201, body: { subscriptionId: 'sub_1', cancelAtPeriodEnd: true } });

    const result = await service.cancelSubscription('user_1', 'key_1');

    expect(result).toEqual({ subscriptionId: 'sub_1', cancelAtPeriodEnd: true, idempotent: true });
  });

  it('updates and saves idempotent result for cancel', async () => {
    const { service, prisma, tenantContext, idempotency } = createService();
    tenantContext.getTenantId.mockReturnValue('tenant_1');
    idempotency.findExisting.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_1' });
    prisma.subscription.update.mockResolvedValue({
      id: 'sub_1',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    });

    const result = await service.cancelSubscription('user_1', 'key_1');

    expect(result).toMatchObject({ subscriptionId: 'sub_1', cancelAtPeriodEnd: true, idempotent: false });
    expect(prisma.subscriptionEvent.create).toHaveBeenCalled();
    expect(idempotency.save).toHaveBeenCalled();
  });

  it('updates and saves idempotent result for resume', async () => {
    const { service, prisma, tenantContext, idempotency } = createService();
    tenantContext.getTenantId.mockReturnValue('tenant_1');
    idempotency.findExisting.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_1' });
    prisma.subscription.update.mockResolvedValue({
      id: 'sub_1',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    });

    const result = await service.resumeSubscription('user_1', 'key_1');

    expect(result).toMatchObject({ subscriptionId: 'sub_1', cancelAtPeriodEnd: false, idempotent: false });
    expect(prisma.subscriptionEvent.create).toHaveBeenCalled();
    expect(idempotency.save).toHaveBeenCalled();
  });

  it('returns false for premium access when subscription flag is enabled and no active subscription', async () => {
    const { service, prisma, configService } = createService();
    configService.getBoolean.mockResolvedValue(true);
    prisma.subscription.findFirst.mockResolvedValue(null);

    const result = await service.hasPremiumAccess('user_1', 'tenant_1');

    expect(result).toBe(false);
  });

  it('returns true for premium access when feature flag is disabled', async () => {
    const { service, configService } = createService();
    configService.getBoolean.mockResolvedValue(false);

    const result = await service.hasPremiumAccess('user_1', 'tenant_1');

    expect(result).toBe(true);
  });

  it('processes webhook with provider verification and status mapping', async () => {
    const { service, prisma, provider } = createService();
    provider.mapWebhookStatus.mockReturnValue(SubStatus.ACTIVE);
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      tenantId: 'tenant_1',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      canceledAt: null,
    });
    prisma.subscription.update.mockResolvedValue({
      id: 'sub_1',
      tenantId: 'tenant_1',
      status: SubStatus.ACTIVE,
    });

    const payload = {
      providerSubId: 'provider_sub_1',
      eventType: 'subscription.charged',
      status: 'ACTIVE',
    };

    const result = await service.handleRazorpaySubscriptionWebhook(payload, 'sig_1');

    expect(provider.verifyWebhookSignature).toHaveBeenCalledWith(payload, 'sig_1');
    expect(provider.mapWebhookStatus).toHaveBeenCalledWith('ACTIVE');
    expect(result).toEqual({ ok: true, subscriptionId: 'sub_1', status: SubStatus.ACTIVE });
  });

  it('throws when webhook subscription is missing', async () => {
    const { service, prisma } = createService();
    prisma.subscription.findUnique.mockResolvedValue(null);

    await expect(
      service.handleRazorpaySubscriptionWebhook(
        {
          providerSubId: 'provider_sub_missing',
          eventType: 'subscription.charged',
          status: 'ACTIVE',
        },
        'sig_1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
