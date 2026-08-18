import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  function createService() {
    const prisma = {
      outboxMessage: {
        create: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      notificationEvent: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    } as unknown as any;

    const service = new OutboxService(prisma);
    return { service, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates non-deduped outbox messages', async () => {
    const { service, prisma } = createService();
    prisma.outboxMessage.create.mockResolvedValue({ id: 'o_1' });

    await service.enqueue({
      topic: 'notification.email',
      payload: { notificationEventId: 'n_1' } as any,
    });

    expect(prisma.outboxMessage.create).toHaveBeenCalled();
    expect(prisma.outboxMessage.upsert).not.toHaveBeenCalled();
  });

  it('upserts deduped outbox messages', async () => {
    const { service, prisma } = createService();
    prisma.outboxMessage.upsert.mockResolvedValue({ id: 'o_1' });

    await service.enqueue({
      topic: 'auth.verify_email',
      dedupeKey: 'verify:key',
      payload: { email: 'a@b.com' } as any,
    });

    expect(prisma.outboxMessage.upsert).toHaveBeenCalled();
    expect(prisma.outboxMessage.create).not.toHaveBeenCalled();
  });

  it('marks messages processed when dispatch succeeds', async () => {
    const { service, prisma } = createService();
    prisma.outboxMessage.findMany.mockResolvedValue([
      {
        id: 'o_1',
        topic: 'auth.verify_email',
        payload: { email: 'a@b.com', verifyUrl: 'https://x' },
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
      },
    ]);
    prisma.outboxMessage.update.mockResolvedValue({});

    const result = await service.processPending(10);

    expect(result).toEqual({ scanned: 1, processed: 1, failed: 0 });
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o_1' },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });

  it('marks messages retry/dead when dispatch fails', async () => {
    const { service, prisma } = createService();
    prisma.outboxMessage.findMany.mockResolvedValue([
      {
        id: 'o_2',
        topic: 'notification.email',
        payload: {},
        attempts: 1,
        maxAttempts: 2,
        nextAttemptAt: new Date(),
      },
    ]);
    prisma.outboxMessage.update.mockResolvedValue({});

    const result = await service.processPending(10);

    expect(result).toEqual({ scanned: 1, processed: 0, failed: 1 });
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o_2' },
        data: expect.objectContaining({ status: 'DEAD', attempts: 2 }),
      }),
    );
  });

  it('returns aggregate status counts', async () => {
    const { service, prisma } = createService();
    prisma.outboxMessage.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const status = await service.getStatus();

    expect(status.pending).toBe(4);
    expect(status.retry).toBe(2);
    expect(status.dead).toBe(1);
  });
});
