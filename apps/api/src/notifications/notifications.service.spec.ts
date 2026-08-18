import { NotificationChannel, NotificationEventKey } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService templates', () => {
  function createService() {
    const createdEvents: Array<Record<string, unknown>> = [];
    const createdOutbox: Array<Record<string, unknown>> = [];

    const tx = {
      notificationEvent: {
        create: jest.fn(async (input: Record<string, unknown>) => {
          createdEvents.push(input);
          return { id: `notif_${createdEvents.length}` };
        }),
      },
      outboxMessage: {
        create: jest.fn(async (input: Record<string, unknown>) => {
          createdOutbox.push(input);
          return input;
        }),
        upsert: jest.fn(async (input: Record<string, unknown>) => {
          createdOutbox.push(input);
          return input;
        }),
      },
    } as any;

    const prisma = {
      userNotificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      notificationEvent: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      outboxMessage: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(tx);
        }
        return Promise.all(arg as Array<Promise<unknown>>);
      }),
    } as unknown as any;

    const configService = {
      get: jest.fn().mockResolvedValue([
        {
          id: 'generation_email_en',
          event: 'GENERATION_COMPLETED',
          channel: 'EMAIL',
          locale: 'en',
          title: 'Asset {{assetId}} ready',
          body: 'Hello {{name}}, your output is {{outputUrl}}',
          active: true,
        },
      ]),
      set: jest.fn(),
    } as unknown as any;

    const outboxService = {
      enqueue: jest.fn(async ({ tx: transaction }: { tx: any }) => {
        await transaction.outboxMessage.create({ data: { ok: true } });
      }),
    } as unknown as any;

    const service = new NotificationsService(prisma, configService, outboxService);
    return { service, prisma, configService, createdEvents, createdOutbox, outboxService };
  }

  it('renders template variables for matching event/channel/locale', async () => {
    const { service, prisma, outboxService } = createService();

    await service.emit({
      tenantId: 'tenant_1',
      userId: 'user_1',
      eventKey: NotificationEventKey.GENERATION_COMPLETED,
      title: 'Fallback title',
      body: 'Fallback body',
      metadata: {
        name: 'Satish',
        assetId: 'asset_1',
        outputUrl: 'https://cdn.example.com/a.png',
      },
      locale: 'en',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
  });

  it('falls back to default title/body when template does not match channel', async () => {
    const { service, prisma } = createService();

    await service.emit({
      tenantId: 'tenant_1',
      userId: 'user_1',
      eventKey: NotificationEventKey.GENERATION_FAILED,
      title: 'Generation failed',
      body: 'Your generation failed',
      metadata: { reason: 'provider error' },
      locale: 'en',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('upserts templates in config store', async () => {
    const { service, configService } = createService();

    await service.upsertTemplate('tenant_1', 'user_1', {
      id: 'wallet_low_balance_in_app_en',
      event: 'WALLET_LOW_BALANCE',
      channel: 'IN_APP',
      locale: 'en',
      title: 'Low balance',
      body: 'Balance is now {{balance}}',
      active: true,
    });

    expect(configService.set).toHaveBeenCalled();
  });

  it('lists normalized template rows from config payload', async () => {
    const { service } = createService();
    const rows = await service.listTemplates('tenant_1');

    expect(rows).toEqual([
      {
        id: 'generation_email_en',
        event: 'GENERATION_COMPLETED',
        channel: 'EMAIL',
        locale: 'en',
        title: 'Asset {{assetId}} ready',
        body: 'Hello {{name}}, your output is {{outputUrl}}',
        active: true,
      },
    ]);
  });
});
