import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AssetStatus, NotificationEventKey, Prisma } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { GENERATION_PROCESS_JOB, GENERATION_QUEUE_NAME } from './generation.constants';
import { GenerationExecutionService } from './generation.execution.service';

type GenerationJobPayload = { assetId: string };

@Injectable()
export class GenerationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationWorkerService.name);
  private worker: Worker<GenerationJobPayload> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: GenerationExecutionService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    const enabled = (process.env.GENERATION_WORKER_ENABLED ?? 'false').toLowerCase() === 'true';
    if (!enabled) {
      return;
    }

    this.worker = new Worker<GenerationJobPayload>(
      GENERATION_QUEUE_NAME,
      async job => this.process(job),
      {
        connection: {
          url: process.env.REDIS_URL,
        },
        concurrency: 4,
      },
    );

    this.worker.on('completed', job => {
      this.logger.log(`Generation job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Generation job failed: ${job?.id} - ${error.message}`);
    });

    this.logger.log('Generation worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async process(job: Job<GenerationJobPayload>) {
    if (job.name !== GENERATION_PROCESS_JOB) {
      return;
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: job.data.assetId },
    });

    if (!asset) {
      return;
    }

    if (asset.status !== AssetStatus.QUEUED && asset.status !== AssetStatus.RUNNING) {
      return;
    }

    const promptAudit = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'asset',
        entityId: asset.id,
        action: 'generation.queued',
      },
      orderBy: { createdAt: 'desc' },
    });

    const payload = (promptAudit?.after as Record<string, unknown> | null) ?? null;
    const prompt = payload && typeof payload.prompt === 'string' ? payload.prompt : promptAudit?.reason;
    const negativePrompt = payload && typeof payload.negativePrompt === 'string' ? payload.negativePrompt : undefined;
    const model = payload && typeof payload.model === 'string' ? payload.model : undefined;
    const frameInputs = payload && typeof payload.frameInputs === 'object' && payload.frameInputs !== null
      ? (payload.frameInputs as {
        text?: Record<string, string>;
        images?: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }>;
      })
      : undefined;

    await this.prisma.asset.update({
      where: { id: asset.id },
      data: { status: AssetStatus.RUNNING },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: asset.tenantId,
        actorId: asset.userId,
        action: 'generation.started',
        entityType: 'asset',
        entityId: asset.id,
      },
    });

    try {
      const output = await this.executor.execute({
        assetId: asset.id,
        kind: asset.kind,
        prompt,
        negativePrompt,
        model,
        frameInputs,
      });

      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: AssetStatus.SUCCEEDED,
          outputUrl: output.outputUrl,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId: asset.tenantId,
          actorId: asset.userId,
          action: 'generation.succeeded',
          entityType: 'asset',
          entityId: asset.id,
          after: {
            provider: output.provider,
            model: output.model,
            outputUrl: output.outputUrl,
            thumbnailUrl: output.thumbnailUrl,
          } as Prisma.InputJsonValue,
        },
      });

      await this.notifications.emit({
        tenantId: asset.tenantId,
        userId: asset.userId,
        eventKey: NotificationEventKey.GENERATION_COMPLETED,
        title: 'Generation completed',
        body: `${asset.title} is ready to view.`,
        metadata: {
          assetId: asset.id,
          outputUrl: output.outputUrl,
          provider: output.provider,
          model: output.model,
        } as Prisma.InputJsonValue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed';

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
            action: 'generation.failed',
            entityType: 'asset',
            entityId: asset.id,
            reason: message,
          },
        });
      });

      await this.notifications.emit({
        tenantId: asset.tenantId,
        userId: asset.userId,
        eventKey: NotificationEventKey.GENERATION_FAILED,
        title: 'Generation failed',
        body: `${asset.title} could not be generated. Credits were refunded.`,
        metadata: {
          assetId: asset.id,
          reason: message,
        } as Prisma.InputJsonValue,
      });

      throw error;
    }
  }
}
