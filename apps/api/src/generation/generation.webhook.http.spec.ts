import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

describe('Generation webhook route (HTTP)', () => {
  let app: INestApplication;

  const generationServiceMock = {
    createJob: jest.fn(),
    listJobs: jest.fn(),
    getJob: jest.fn(),
    handleRunwayWebhook: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GenerationController],
      providers: [
        {
          provide: GenerationService,
          useValue: generationServiceMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid signature and forwards payload', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUNWAY_WEBHOOK_SECRET = 'test_secret';

    const payload = {
      assetId: 'asset_http_1',
      status: 'COMPLETED',
      outputUrl: 'https://cdn.example.com/a.mp4',
    };

    const signature = createHmac('sha256', process.env.RUNWAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    generationServiceMock.handleRunwayWebhook.mockResolvedValue({
      ok: true,
      status: 'SUCCEEDED',
      idempotent: false,
    });

    const res = await request(app.getHttpServer())
      .post('/generation/webhooks/runway')
      .set('x-runway-signature', signature)
      .send(payload)
      .expect(201);

    expect(res.body).toEqual({ ok: true, status: 'SUCCEEDED', idempotent: false });
    expect(generationServiceMock.handleRunwayWebhook).toHaveBeenCalledWith(payload);
  });

  it('rejects invalid signature', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUNWAY_WEBHOOK_SECRET = 'test_secret';

    const payload = {
      assetId: 'asset_http_2',
      status: 'FAILED',
      error: 'bad request',
    };

    await request(app.getHttpServer())
      .post('/generation/webhooks/runway')
      .set('x-runway-signature', 'invalid_signature')
      .send(payload)
      .expect(400);

    expect(generationServiceMock.handleRunwayWebhook).not.toHaveBeenCalled();
  });

  it('rejects request in production when webhook secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RUNWAY_WEBHOOK_SECRET;

    const payload = {
      assetId: 'asset_http_2b',
      status: 'COMPLETED',
      outputUrl: 'https://cdn.example.com/c.mp4',
    };

    await request(app.getHttpServer()).post('/generation/webhooks/runway').send(payload).expect(400);

    expect(generationServiceMock.handleRunwayWebhook).not.toHaveBeenCalled();
  });

  it('handles repeated callbacks as idempotent when service returns idempotent result', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUNWAY_WEBHOOK_SECRET = 'test_secret';

    const payload = {
      assetId: 'asset_http_3',
      status: 'COMPLETED',
      outputUrl: 'https://cdn.example.com/b.mp4',
    };

    const signature = createHmac('sha256', process.env.RUNWAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    generationServiceMock.handleRunwayWebhook
      .mockResolvedValueOnce({ ok: true, status: 'SUCCEEDED', idempotent: false })
      .mockResolvedValueOnce({ ok: true, status: 'SUCCEEDED', idempotent: true });

    const first = await request(app.getHttpServer())
      .post('/generation/webhooks/runway')
      .set('x-runway-signature', signature)
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/generation/webhooks/runway')
      .set('x-runway-signature', signature)
      .send(payload)
      .expect(201);

    expect(first.body).toEqual({ ok: true, status: 'SUCCEEDED', idempotent: false });
    expect(second.body).toEqual({ ok: true, status: 'SUCCEEDED', idempotent: true });
    expect(generationServiceMock.handleRunwayWebhook).toHaveBeenCalledTimes(2);
  });
});
