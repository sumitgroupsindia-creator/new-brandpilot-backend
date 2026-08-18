import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { GenerationService } from './generation.service';

describe('GenerationService.handleRunwayWebhook', () => {
  const createMock = () => {
    const asset = {
      id: 'asset_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      title: 'Launch Visual',
      creditsUsed: 25,
      outputUrl: null,
      status: AssetStatus.RUNNING,
    };

    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      asset: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async fn =>
        fn({
          asset: { update: jest.fn() },
          walletTransaction: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        }),
      ),
    } as unknown as any;

    const tenantContext = { getTenantId: jest.fn() } as any;
    const queue = { enqueue: jest.fn() } as any;
    const idempotency = { findExisting: jest.fn(), save: jest.fn() } as any;
    const notifications = { emit: jest.fn() } as any;
    const configService = { getNumber: jest.fn() } as any;
    const subscriptionsService = { hasPremiumAccess: jest.fn() } as any;

    const service = new GenerationService(
      prisma,
      tenantContext,
      queue,
      idempotency,
      notifications,
      configService,
      subscriptionsService,
    );
    return { service, prisma, asset };
  };

  it('throws when asset is missing', async () => {
    const { service, prisma } = createMock();
    prisma.asset.findUnique.mockResolvedValue(null);

    await expect(
      service.handleRunwayWebhook({ assetId: 'missing', status: 'SUCCEEDED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent for terminal assets', async () => {
    const { service, prisma, asset } = createMock();
    prisma.asset.findUnique.mockResolvedValue({ ...asset, status: AssetStatus.FAILED });

    const result = await service.handleRunwayWebhook({
      assetId: asset.id,
      status: 'SUCCEEDED',
      outputUrl: 'https://cdn.example.com/out.mp4',
    });

    expect(result).toEqual({ ok: true, status: AssetStatus.FAILED, idempotent: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks failed and refunds for failure states', async () => {
    const { service, prisma, asset } = createMock();
    prisma.asset.findUnique.mockResolvedValue(asset);

    const result = await service.handleRunwayWebhook({
      assetId: asset.id,
      status: 'FAILED',
      error: 'provider timeout',
    });

    expect(result).toEqual({ ok: true, status: 'FAILED', idempotent: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('marks succeeded for completion states', async () => {
    const { service, prisma, asset } = createMock();
    prisma.asset.findUnique.mockResolvedValue(asset);

    const result = await service.handleRunwayWebhook({
      assetId: asset.id,
      status: 'COMPLETED',
      outputUrl: 'https://cdn.example.com/out.mp4',
    });

    expect(result).toEqual({ ok: true, status: 'SUCCEEDED', idempotent: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns passthrough for non-terminal provider statuses', async () => {
    const { service, prisma, asset } = createMock();
    prisma.asset.findUnique.mockResolvedValue(asset);

    const result = await service.handleRunwayWebhook({
      assetId: asset.id,
      status: 'processing',
    });

    expect(result).toEqual({ ok: true, status: 'PROCESSING', idempotent: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('supports canceled and timed out failure aliases', async () => {
    const { service, prisma, asset } = createMock();
    prisma.asset.findUnique.mockResolvedValue(asset);

    const canceled = await service.handleRunwayWebhook({
      assetId: asset.id,
      status: 'CANCELED',
    });
    const timedOut = await service.handleRunwayWebhook({
      assetId: asset.id,
      status: 'TIMED_OUT',
    });

    expect(canceled).toEqual({ ok: true, status: 'FAILED', idempotent: false });
    expect(timedOut).toEqual({ ok: true, status: 'FAILED', idempotent: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
