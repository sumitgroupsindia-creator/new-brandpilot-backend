import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationEventKey,
  Prisma,
} from '@prisma/client';
import { ConfigKeys } from '@brandpilot/shared';
import { ConfigService } from '../config/config.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationPreferencesInput {
  eventKey: NotificationEventKey;
  email?: boolean;
  push?: boolean;
  inApp?: boolean;
}

export interface NotificationTemplate {
  id: string;
  event: string;
  channel: string;
  locale: string;
  title: string;
  body: string;
  active: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
  ) {}

  async listTemplates(tenantId: string | null): Promise<NotificationTemplate[]> {
    const raw = await this.configService.get<unknown>(ConfigKeys.NOTIFICATIONS_TEMPLATES, tenantId);
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter(item => typeof item === 'object' && item !== null)
      .map((item, index) => {
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id ?? `template-${index + 1}`),
          event: String(row.event ?? ''),
          channel: String(row.channel ?? ''),
          locale: String(row.locale ?? 'en'),
          title: String(row.title ?? ''),
          body: String(row.body ?? ''),
          active: Boolean(row.active ?? true),
        };
      });
  }

  async upsertTemplate(
    tenantId: string | null,
    updatedBy: string,
    template: NotificationTemplate,
  ): Promise<NotificationTemplate[]> {
    const existing = await this.listTemplates(tenantId);
    const next = [...existing];
    const index = next.findIndex(item => item.id === template.id);
    if (index >= 0) {
      next[index] = template;
    } else {
      next.push(template);
    }

    await this.configService.set(ConfigKeys.NOTIFICATIONS_TEMPLATES, next as unknown as Prisma.InputJsonValue, {
      tenantId,
      updatedBy,
      reason: 'notification template updated',
      isSecret: false,
    });

    return this.listTemplates(tenantId);
  }

  async getPreferences(userId: string) {
    const existing = await this.prisma.userNotificationPreference.findMany({
      where: { userId },
      orderBy: { eventKey: 'asc' },
    });

    const prefMap = new Map(existing.map(pref => [pref.eventKey, pref]));
    return Object.values(NotificationEventKey).map(eventKey => {
      const pref = prefMap.get(eventKey);
      return {
        eventKey,
        email: pref?.email ?? true,
        push: pref?.push ?? true,
        inApp: pref?.inApp ?? true,
      };
    });
  }

  async upsertPreferences(userId: string, input: NotificationPreferencesInput[]) {
    if (!input.length) {
      return this.getPreferences(userId);
    }

    await this.prisma.$transaction(
      input.map(item =>
        this.prisma.userNotificationPreference.upsert({
          where: {
            userId_eventKey: {
              userId,
              eventKey: item.eventKey,
            },
          },
          create: {
            userId,
            eventKey: item.eventKey,
            email: item.email ?? true,
            push: item.push ?? true,
            inApp: item.inApp ?? true,
          },
          update: {
            email: item.email ?? true,
            push: item.push ?? true,
            inApp: item.inApp ?? true,
          },
        }),
      ),
    );

    return this.getPreferences(userId);
  }

  async listEvents(userId: string, limit = 30) {
    const events = await this.prisma.notificationEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return events.map(event => ({
      id: event.id,
      eventKey: event.eventKey,
      channel: event.channel,
      title: event.title,
      body: event.body,
      status: event.status,
      metadata: event.metadata,
      deliveredAt: event.deliveredAt,
      createdAt: event.createdAt,
    }));
  }

  async emit(params: {
    tenantId: string;
    userId: string;
    eventKey: NotificationEventKey;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
    locale?: string;
  }) {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: {
        userId_eventKey: {
          userId: params.userId,
          eventKey: params.eventKey,
        },
      },
    });

    const enabled = {
      inApp: pref?.inApp ?? true,
      email: pref?.email ?? true,
      push: pref?.push ?? true,
    };

    const locale = params.locale ?? 'en';
    const renderedInApp = await this.renderTemplate({
      tenantId: params.tenantId,
      eventKey: params.eventKey,
      channel: NotificationChannel.IN_APP,
      locale,
      defaultTitle: params.title,
      defaultBody: params.body,
      metadata: params.metadata,
    });
    const renderedEmail = await this.renderTemplate({
      tenantId: params.tenantId,
      eventKey: params.eventKey,
      channel: NotificationChannel.EMAIL,
      locale,
      defaultTitle: params.title,
      defaultBody: params.body,
      metadata: params.metadata,
    });
    const renderedPush = await this.renderTemplate({
      tenantId: params.tenantId,
      eventKey: params.eventKey,
      channel: NotificationChannel.PUSH,
      locale,
      defaultTitle: params.title,
      defaultBody: params.body,
      metadata: params.metadata,
    });

    await this.prisma.$transaction(async tx => {
      if (enabled.inApp) {
        await tx.notificationEvent.create({
          data: {
            tenantId: params.tenantId,
            userId: params.userId,
            eventKey: params.eventKey,
            channel: NotificationChannel.IN_APP,
            title: renderedInApp.title,
            body: renderedInApp.body,
            status: 'DELIVERED',
            deliveredAt: new Date(),
            metadata: params.metadata,
          },
        });
      }

      if (enabled.email) {
        const emailEvent = await tx.notificationEvent.create({
          data: {
            tenantId: params.tenantId,
            userId: params.userId,
            eventKey: params.eventKey,
            channel: NotificationChannel.EMAIL,
            title: renderedEmail.title,
            body: renderedEmail.body,
            status: 'QUEUED',
            metadata: params.metadata,
          },
        });

        await this.outboxService.enqueue({
          tenantId: params.tenantId,
          userId: params.userId,
          topic: 'notification.email',
          payload: {
            notificationEventId: emailEvent.id,
          } as Prisma.InputJsonValue,
          tx,
        });
      }

      if (enabled.push) {
        const pushEvent = await tx.notificationEvent.create({
          data: {
            tenantId: params.tenantId,
            userId: params.userId,
            eventKey: params.eventKey,
            channel: NotificationChannel.PUSH,
            title: renderedPush.title,
            body: renderedPush.body,
            status: 'QUEUED',
            metadata: params.metadata,
          },
        });

        await this.outboxService.enqueue({
          tenantId: params.tenantId,
          userId: params.userId,
          topic: 'notification.push',
          payload: {
            notificationEventId: pushEvent.id,
          } as Prisma.InputJsonValue,
          tx,
        });
      }
    });
  }

  private async renderTemplate(input: {
    tenantId: string | null;
    eventKey: NotificationEventKey;
    channel: NotificationChannel;
    locale: string;
    defaultTitle: string;
    defaultBody: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const templates = await this.listTemplates(input.tenantId);
    const event = input.eventKey;
    const channel = input.channel;
    const template =
      templates.find(
        row =>
          row.active &&
          row.event === event &&
          row.channel.toUpperCase() === channel &&
          row.locale.toLowerCase() === input.locale.toLowerCase(),
      ) ||
      templates.find(
        row =>
          row.active &&
          row.event === event &&
          row.channel.toUpperCase() === channel &&
          row.locale.toLowerCase() === 'en',
      );

    const variables = this.toTemplateVariables(input.metadata);
    return {
      title: this.interpolateTemplate(template?.title ?? input.defaultTitle, variables),
      body: this.interpolateTemplate(template?.body ?? input.defaultBody, variables),
    };
  }

  private toTemplateVariables(metadata?: Prisma.InputJsonValue) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {} as Record<string, string>;
    }
    const source = metadata as Record<string, unknown>;
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined) continue;
      vars[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return vars;
  }

  private interpolateTemplate(template: string, variables: Record<string, string>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
      return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
    });
  }
}
