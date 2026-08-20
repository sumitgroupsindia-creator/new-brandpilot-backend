import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export type OutboxTopic = 'notification.email' | 'notification.push' | 'auth.verify_email' | 'auth.reset_password';

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private readonly pollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000);
  private workerTimer: NodeJS.Timeout | null = null;
  private workerRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const defaultEnabled = process.env.NODE_ENV === 'production' ? 'false' : 'true';
    const enabled = (process.env.OUTBOX_WORKER_ENABLED ?? defaultEnabled).toLowerCase() === 'true';
    if (!enabled) {
      return;
    }

    this.workerTimer = setInterval(() => {
      void this.safeProcessTick();
    }, Math.max(1000, this.pollIntervalMs));
  }

  onModuleDestroy() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async enqueue(params: {
    tenantId?: string | null;
    userId?: string | null;
    topic: OutboxTopic;
    dedupeKey?: string;
    payload: Prisma.InputJsonValue;
    tx?: Prisma.TransactionClient;
  }) {
    const db = (params.tx as Prisma.TransactionClient | undefined) ?? this.prisma;

    if (!params.dedupeKey) {
      return db.outboxMessage.create({
        data: {
          tenantId: params.tenantId ?? null,
          userId: params.userId ?? null,
          topic: params.topic,
          dedupeKey: null,
          payload: params.payload,
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
        },
      });
    }

    return db.outboxMessage.upsert({
      where: {
        topic_dedupeKey: {
          topic: params.topic,
          dedupeKey: params.dedupeKey,
        },
      },
      create: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        topic: params.topic,
        dedupeKey: params.dedupeKey,
        payload: params.payload,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
      },
      update: {
        payload: params.payload,
        status: 'PENDING',
        nextAttemptAt: new Date(),
        processedAt: null,
        lastError: null,
      },
    });
  }

  async processPending(limit = 100) {
    const now = new Date();
    const pending = await this.prisma.outboxMessage.findMany({
      where: {
        status: { in: ['PENDING', 'RETRY'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    let processed = 0;
    let failed = 0;

    for (const message of pending) {
      try {
        await this.dispatch(message.topic, message.payload as Record<string, unknown>);
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lastError: null,
          },
        });
        processed += 1;
      } catch (error) {
        const attempts = message.attempts + 1;
        const maxAttempts = message.maxAttempts;
        const isDead = attempts >= maxAttempts;
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: {
            attempts,
            status: isDead ? 'DEAD' : 'RETRY',
            nextAttemptAt: isDead
              ? message.nextAttemptAt
              : new Date(Date.now() + Math.pow(2, attempts) * 1000),
            lastError: error instanceof Error ? error.message : 'unknown error',
          },
        });
        failed += 1;
      }
    }

    return {
      scanned: pending.length,
      processed,
      failed,
    };
  }

  async getStatus() {
    const [pending, retry, dead] = await Promise.all([
      this.prisma.outboxMessage.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxMessage.count({ where: { status: 'RETRY' } }),
      this.prisma.outboxMessage.count({ where: { status: 'DEAD' } }),
    ]);

    return {
      pending,
      retry,
      dead,
      workerEnabled:
        (process.env.OUTBOX_WORKER_ENABLED ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')).toLowerCase() ===
        'true',
      pollIntervalMs: Math.max(1000, this.pollIntervalMs),
    };
  }

  async listDead(limit = 50) {
    const rows = await this.prisma.outboxMessage.findMany({
      where: { status: 'DEAD' },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async dispatch(topic: string, payload: Record<string, unknown>) {
    if (topic === 'notification.email') {
      const notificationEventId = String(payload.notificationEventId ?? '');
      if (!notificationEventId) {
        throw new Error('notificationEventId missing in outbox payload');
      }

      const event = await this.prisma.notificationEvent.findUnique({
        where: { id: notificationEventId },
      });
      if (!event) {
        throw new Error(`Notification event not found: ${notificationEventId}`);
      }

      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { email: true },
      });
      if (!user?.email) {
        throw new Error(`User email not found for notification event: ${notificationEventId}`);
      }

      await this.sendEmail(user.email, event.title, event.body);

      await this.prisma.notificationEvent.update({
        where: { id: notificationEventId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
      return;
    }

    if (topic === 'notification.push') {
      const notificationEventId = String(payload.notificationEventId ?? '');
      if (!notificationEventId) {
        throw new Error('notificationEventId missing in outbox payload');
      }

      const event = await this.prisma.notificationEvent.findUnique({
        where: { id: notificationEventId },
      });
      if (!event) {
        throw new Error(`Notification event not found: ${notificationEventId}`);
      }

      await this.sendPush({
        userId: event.userId,
        title: event.title,
        body: event.body,
        metadata: event.metadata as Record<string, unknown> | null,
      });

      await this.prisma.notificationEvent.update({
        where: { id: notificationEventId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
      return;
    }

    if (topic === 'auth.verify_email') {
      const email = String(payload.email ?? '');
      const verifyUrl = String(payload.verifyUrl ?? '');
      if (!email || !verifyUrl) {
        throw new Error('auth.verify_email payload missing email or verifyUrl');
      }
      await this.sendEmail(
        email,
        'Verify your BrandPilot account',
        `Welcome to BrandPilot. Verify your account by opening: ${verifyUrl}`,
      );
      return;
    }

    if (topic === 'auth.reset_password') {
      const email = String(payload.email ?? '');
      const resetUrl = String(payload.resetUrl ?? '');
      if (!email || !resetUrl) {
        throw new Error('auth.reset_password payload missing email or resetUrl');
      }
      await this.sendEmail(
        email,
        'Reset your BrandPilot password',
        `A password reset was requested. Use this link: ${resetUrl}`,
      );
      return;
    }

    throw new Error(`Unsupported outbox topic: ${topic}`);
  }

  private async safeProcessTick() {
    if (this.workerRunning) {
      return;
    }

    this.workerRunning = true;
    try {
      await this.processPending(100);
    } catch (error) {
      this.logger.error('Outbox worker tick failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.workerRunning = false;
    }
  }

  private async sendEmail(to: string, subject: string, text: string) {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

    if (!host || !from) {
      if (isProd) {
        throw new Error('SMTP_HOST/SMTP_FROM not configured');
      }
      this.logger.log(`SMTP not configured. Skipping email send to ${to} with subject \"${subject}\"`);
      return;
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });
  }

  private async sendPush(input: {
    userId: string;
    title: string;
    body: string;
    metadata: Record<string, unknown> | null;
  }) {
    const webhookUrl = process.env.PUSH_PROVIDER_WEBHOOK_URL;
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

    if (!webhookUrl) {
      if (isProd) {
        throw new Error('PUSH_PROVIDER_WEBHOOK_URL not configured');
      }
      this.logger.log(`Push webhook not configured. Skipping push for user ${input.userId}`);
      return;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Push provider failed: ${response.status} ${body}`);
    }
  }
}
