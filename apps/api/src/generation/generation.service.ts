import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetKind, AssetStatus, FrameTier, NotificationEventKey, Prisma } from '@prisma/client';
import { ConfigKeys } from '@brandpilot/shared';
import { ConfigService as AppConfigService } from '../config/config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { GenerationQueueService } from './generation.queue.service';

export interface CreateGenerationJobInput {
  frameId: string;
  imageId?: string;
  kind: AssetKind;
  prompt: string;
  title?: string;
  negativePrompt?: string;
  model?: string;
  frameInputs?: {
    text?: Record<string, string>;
    images?: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }>;
  };
}

interface CatalogImageItem {
  id: string;
  name: string;
  url: string;
  active: boolean;
  sortOrder?: number;
  tier?: 'FREE' | 'PREMIUM';
  estimatedCredits?: number;
}

interface CatalogImageCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  images: CatalogImageItem[];
}

interface AssetUnlockState {
  users?: Record<string, {
    frames?: Record<string, string>;
    images?: Record<string, string>;
  }>;
}

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly queue: GenerationQueueService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
    private readonly configService: AppConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async createJob(userId: string, input: CreateGenerationJobInput, idempotencyKey: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    const isSuperAdmin = await this.subscriptionsService.isSuperAdmin(userId, tenantId);

    const existing = await this.idempotency.findExisting(idempotencyKey, tenantId, userId);
    if (existing) {
      return {
        ...(existing.body as Record<string, unknown>),
        idempotent: true,
      };
    }

    if (!input.prompt?.trim()) {
      throw new BadRequestException('Prompt is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        emailVerifiedAt: true,
      },
    });
    if (!user || user.tenantId !== tenantId) {
      throw new ForbiddenException('User does not belong to tenant');
    }
    if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new ForbiddenException('EMAIL_VERIFICATION_REQUIRED');
    }

    const frame = await this.prisma.frame.findFirst({
      where: { id: input.frameId, tenantId },
    });
    if (!frame) {
      throw new NotFoundException('Frame not found');
    }

    const selectedImage = input.imageId ? await this.findActiveImageById(tenantId, input.imageId) : null;
    const requiresPremiumAccess = frame.tier === FrameTier.PREMIUM || selectedImage?.tier === 'PREMIUM';
    const hasPremiumAccess = requiresPremiumAccess
      ? (isSuperAdmin || await this.subscriptionsService.hasPremiumAccess(userId, tenantId))
      : false;

    if (frame.tier === FrameTier.PREMIUM && !hasPremiumAccess) {
      throw new ForbiddenException('SUBSCRIPTION_REQUIRED');
    }
    if (selectedImage?.tier === 'PREMIUM' && !hasPremiumAccess) {
      throw new ForbiddenException('SUBSCRIPTION_REQUIRED');
    }

    const now = new Date();
    const unlockState = await this.getAssetUnlockState(tenantId, now);
    const frameAlreadyUnlocked = this.isAssetUnlocked(unlockState, userId, 'frames', frame.id, now);
    const imageAlreadyUnlocked = selectedImage
      ? this.isAssetUnlocked(unlockState, userId, 'images', selectedImage.id, now)
      : false;

    let frameUnlockCredits = frame.estimatedCredits > 0 ? frame.estimatedCredits : input.kind === 'VIDEO' ? 40 : 10;
    if (frame.tier === FrameTier.PREMIUM) {
      const premiumAlsoCostsCredits = await this.subscriptionsService.shouldPremiumAlsoCostCredits(tenantId);
      if (!premiumAlsoCostsCredits) {
        frameUnlockCredits = 0;
      }
    }

    const imageUnlockCredits = selectedImage
      ? Math.max(0, Math.floor(Number(selectedImage.estimatedCredits ?? 0)))
      : 0;

    const debitCredits = isSuperAdmin
      ? 0
      : (frameAlreadyUnlocked ? 0 : frameUnlockCredits) +
        (selectedImage && !imageAlreadyUnlocked ? imageUnlockCredits : 0);

    let balance = 0;
    if (!isSuperAdmin) {
      const wallet = await this.prisma.walletTransaction.aggregate({
        where: { tenantId, userId },
        _sum: { amount: true },
      });
      balance = wallet._sum.amount ?? 0;
      if (balance < debitCredits) {
        throw new BadRequestException('Insufficient credits');
      }
    }

    const nowLabel = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const result = await this.prisma.$transaction(async tx => {
      if (debitCredits > 0) {
        await tx.walletTransaction.create({
          data: {
            tenantId,
            userId,
            type: 'DEBIT',
            amount: -debitCredits,
            summary: `Generation queued: ${frame.title}`,
          },
        });
      }

      const asset = await tx.asset.create({
        data: {
          tenantId,
          userId,
          frameId: frame.id,
          title: input.title?.trim() || `${frame.title} • ${nowLabel}`,
          kind: input.kind,
          status: AssetStatus.QUEUED,
          creditsUsed: debitCredits,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: 'generation.queued',
          entityType: 'asset',
          entityId: asset.id,
          reason: input.prompt.slice(0, 250),
          after: {
            frameId: frame.id,
            imageId: selectedImage?.id ?? null,
            creditsUsed: debitCredits,
            frameUnlockCharge: frameAlreadyUnlocked ? 0 : frameUnlockCredits,
            imageUnlockCharge: selectedImage && !imageAlreadyUnlocked ? imageUnlockCredits : 0,
            kind: input.kind,
            model: input.model ?? null,
            prompt: input.prompt,
            negativePrompt: input.negativePrompt ?? null,
            frameInputs: input.frameInputs ?? null,
            status: asset.status,
          } as Prisma.InputJsonValue,
        },
      });

      const nextUnlockState = this.cloneUnlockState(unlockState);
      const frameUnlockedUntil = this.markAssetUnlocked(nextUnlockState, userId, 'frames', frame.id, now);
      let imageUnlockedUntil: string | undefined;
      if (selectedImage) {
        imageUnlockedUntil = this.markAssetUnlocked(nextUnlockState, userId, 'images', selectedImage.id, now);
      }
      await this.setAssetUnlockState(tenantId, nextUnlockState, tx);

      if (frameUnlockedUntil || imageUnlockedUntil) {
        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: userId,
            action: 'asset.unlock.updated',
            entityType: 'user',
            entityId: userId,
            after: {
              frameId: frame.id,
              frameUnlockedUntil,
              imageId: selectedImage?.id ?? null,
              imageUnlockedUntil: imageUnlockedUntil ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return asset;
    });

    try {
      await this.queue.enqueue(result.id);
    } catch (error) {
      await this.prisma.$transaction(async tx => {
        await tx.asset.update({
          where: { id: result.id },
          data: { status: AssetStatus.FAILED },
        });

        await tx.walletTransaction.create({
          data: {
            tenantId,
            userId,
            type: 'REFUND',
            amount: debitCredits,
            summary: `Queue enqueue failed: ${frame.title}`,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: userId,
            action: 'generation.enqueue_failed',
            entityType: 'asset',
            entityId: result.id,
            reason: error instanceof Error ? error.message : 'Queue enqueue failed',
          },
        });
      });

      throw new BadRequestException('Unable to queue generation job at the moment');
    }

    const response = {
      jobId: result.id,
      status: result.status,
      creditsHeld: debitCredits,
      frameUnlocked: true,
      imageUnlocked: selectedImage ? true : undefined,
      idempotent: false,
    };

    if (!isSuperAdmin) {
      const remainingBalance = balance - debitCredits;
      const threshold =
        (await this.configService.getNumber(ConfigKeys.BILLING_LOW_BALANCE_THRESHOLD, tenantId)) ?? 20;
      if (balance > threshold && remainingBalance <= threshold) {
        await this.notifications.emit({
          tenantId,
          userId,
          eventKey: NotificationEventKey.WALLET_LOW_BALANCE,
          title: 'Wallet running low',
          body: `Your balance is now ${remainingBalance} credits. Please recharge soon.`,
          metadata: {
            balance: remainingBalance,
            threshold,
            assetId: result.id,
          } as Prisma.InputJsonValue,
        });
      }
    }

    await this.idempotency.save(
      {
        key: idempotencyKey,
        tenantId,
        userId,
        method: 'POST',
        path: '/generation/jobs',
        body: input as unknown as Record<string, unknown>,
      },
      201,
      response as unknown as Record<string, unknown>,
    );

    return response;
  }

  private async findActiveImageById(tenantId: string, imageId: string) {
    const categories = await this.getCatalogConfig<CatalogImageCategory[]>(tenantId, 'imageCategories', []);
    if (!Array.isArray(categories)) {
      throw new NotFoundException('Image not found');
    }

    for (const category of categories) {
      if (!category || category.active === false || !Array.isArray(category.images)) {
        continue;
      }

      const image = category.images.find(item => item.id === imageId && item.active !== false);
      if (!image) {
        continue;
      }

      return {
        id: image.id,
        name: image.name,
        tier: image.tier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
        estimatedCredits: Number.isFinite(Number(image.estimatedCredits))
          ? Math.max(0, Math.floor(Number(image.estimatedCredits)))
          : 0,
      };
    }

    throw new NotFoundException('Image not found');
  }

  private isAssetUnlocked(
    state: AssetUnlockState,
    userId: string,
    type: 'frames' | 'images',
    assetId: string,
    now: Date,
  ) {
    const userState = state.users?.[userId];
    if (!userState) {
      return false;
    }

    const map = type === 'frames' ? userState.frames : userState.images;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return false;
    }

    const expiresAt = map[assetId];
    if (!expiresAt) {
      return false;
    }

    const expiresAtTime = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtTime)) {
      return false;
    }

    return expiresAtTime > now.getTime();
  }

  private markAssetUnlocked(
    state: AssetUnlockState,
    userId: string,
    type: 'frames' | 'images',
    assetId: string,
    now: Date,
  ) {
    if (!state.users) {
      state.users = {};
    }

    const userState = state.users[userId] ?? { frames: {}, images: {} };
    const expiresAt = this.getNextMonthIso(now);
    const map = type === 'frames' ? (userState.frames ?? {}) : (userState.images ?? {});
    map[assetId] = expiresAt;

    if (type === 'frames') {
      userState.frames = map;
    } else {
      userState.images = map;
    }
    state.users[userId] = userState;

    return expiresAt;
  }

  private cloneUnlockState(state: AssetUnlockState): AssetUnlockState {
    const users = state.users ?? {};
    return {
      users: Object.fromEntries(
        Object.entries(users).map(([userId, row]) => [
          userId,
          {
            frames:
              row.frames && typeof row.frames === 'object' && !Array.isArray(row.frames)
                ? { ...row.frames }
                : {},
            images:
              row.images && typeof row.images === 'object' && !Array.isArray(row.images)
                ? { ...row.images }
                : {},
          },
        ]),
      ),
    };
  }

  private async getAssetUnlockState(tenantId: string, now: Date) {
    const raw = await this.getCatalogConfig<AssetUnlockState>(tenantId, 'assetUnlocks', { users: {} });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { users: {} };
    }

    const normalized: AssetUnlockState = { users: {} };
    const users = raw.users;
    if (!users || typeof users !== 'object' || Array.isArray(users)) {
      return normalized;
    }

    const nextMonthIso = this.getNextMonthIso(now);
    for (const [userId, row] of Object.entries(users)) {
      const normalizedRow: { frames: Record<string, string>; images: Record<string, string> } = {
        frames: {},
        images: {},
      };

      if (Array.isArray((row as { frames?: unknown }).frames)) {
        for (const frameId of (row as { frames?: unknown[] }).frames ?? []) {
          if (typeof frameId === 'string' && frameId) {
            normalizedRow.frames[frameId] = nextMonthIso;
          }
        }
      } else if ((row as { frames?: unknown }).frames && typeof (row as { frames?: unknown }).frames === 'object') {
        for (const [frameId, expiresAt] of Object.entries((row as { frames?: Record<string, unknown> }).frames ?? {})) {
          if (typeof expiresAt === 'string' && expiresAt) {
            normalizedRow.frames[frameId] = expiresAt;
          }
        }
      }

      if (Array.isArray((row as { images?: unknown }).images)) {
        for (const imageId of (row as { images?: unknown[] }).images ?? []) {
          if (typeof imageId === 'string' && imageId) {
            normalizedRow.images[imageId] = nextMonthIso;
          }
        }
      } else if ((row as { images?: unknown }).images && typeof (row as { images?: unknown }).images === 'object') {
        for (const [imageId, expiresAt] of Object.entries((row as { images?: Record<string, unknown> }).images ?? {})) {
          if (typeof expiresAt === 'string' && expiresAt) {
            normalizedRow.images[imageId] = expiresAt;
          }
        }
      }

      normalized.users![userId] = normalizedRow;
    }

    return normalized;
  }

  private getNextMonthIso(from: Date) {
    const expiresAt = new Date(from);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    return expiresAt.toISOString();
  }

  private async setAssetUnlockState(
    tenantId: string,
    state: AssetUnlockState,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.configEntry.upsert({
      where: {
        tenantId_namespace_key: {
          tenantId,
          namespace: 'catalog',
          key: 'assetUnlocks',
        },
      },
      update: {
        value: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        tenantId,
        namespace: 'catalog',
        key: 'assetUnlocks',
        value: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getCatalogConfig<T>(tenantId: string, key: string, fallback: T): Promise<T> {
    const entry = await this.prisma.configEntry.findUnique({
      where: {
        tenantId_namespace_key: {
          tenantId,
          namespace: 'catalog',
          key,
        },
      },
    });

    if (!entry) {
      return fallback;
    }

    return entry.value as T;
  }

  async listJobs(userId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      return [];
    }

    const assets = await this.prisma.asset.findMany({
      where: { tenantId, userId },
      include: { frame: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return assets.map(asset => ({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      frameName: asset.frame?.title ?? 'Frame',
      createdAt: asset.createdAt.toISOString(),
      creditsUsed: asset.creditsUsed,
      status: asset.status,
      outputUrl: asset.outputUrl,
    }));
  }

  async getJob(userId: string, jobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException('Job not found');
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: jobId, tenantId, userId },
      include: { frame: true },
    });

    if (!asset) {
      throw new NotFoundException('Job not found');
    }

    return {
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      frameName: asset.frame?.title ?? 'Frame',
      createdAt: asset.createdAt.toISOString(),
      creditsUsed: asset.creditsUsed,
      status: asset.status,
      outputUrl: asset.outputUrl,
    };
  }

  async handleRunwayWebhook(input: {
    assetId: string;
    status: string;
    outputUrl?: string;
    error?: string;
  }) {
    const asset = await this.prisma.asset.findUnique({ where: { id: input.assetId } });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const normalizedStatus = input.status.toUpperCase();

    if (asset.status === AssetStatus.SUCCEEDED || asset.status === AssetStatus.FAILED) {
      return { ok: true, status: asset.status, idempotent: true };
    }

    if (normalizedStatus === 'SUCCEEDED' || normalizedStatus === 'COMPLETED') {
      await this.prisma.$transaction(async tx => {
        await tx.asset.update({
          where: { id: asset.id },
          data: {
            status: AssetStatus.SUCCEEDED,
            outputUrl: input.outputUrl ?? asset.outputUrl,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: asset.tenantId,
            actorId: asset.userId,
            action: 'generation.succeeded.webhook',
            entityType: 'asset',
            entityId: asset.id,
            after: {
              outputUrl: input.outputUrl ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      });

      return { ok: true, status: 'SUCCEEDED', idempotent: false };
    }

    if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELED' || normalizedStatus === 'TIMED_OUT') {
      await this.prisma.$transaction(async tx => {
        await tx.asset.update({
          where: { id: asset.id },
          data: { status: AssetStatus.FAILED },
        });

        await tx.walletTransaction.create({
          data: {
            tenantId: asset.tenantId,
            userId: asset.userId,
            type: 'REFUND',
            amount: asset.creditsUsed,
            summary: `Generation refund: ${asset.title}`,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: asset.tenantId,
            actorId: asset.userId,
            action: 'generation.failed.webhook',
            entityType: 'asset',
            entityId: asset.id,
            reason: input.error ?? 'Runway failed',
          },
        });
      });

      return { ok: true, status: 'FAILED', idempotent: false };
    }

    return { ok: true, status: normalizedStatus, idempotent: false };
  }
}
