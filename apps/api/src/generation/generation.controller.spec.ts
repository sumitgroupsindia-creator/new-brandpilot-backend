import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { GenerationController } from './generation.controller';

describe('GenerationController runway webhook signature', () => {
  const generationService = {
    createJob: jest.fn(),
    listJobs: jest.fn(),
    getJob: jest.fn(),
    handleRunwayWebhook: jest.fn(),
  } as any;

  const controller = new GenerationController(generationService);
  const payload = {
    assetId: 'asset_1',
    status: 'COMPLETED',
    outputUrl: 'https://cdn.example.com/out.mp4',
  };

  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.RUNWAY_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RUNWAY_WEBHOOK_SECRET = originalSecret;
    jest.clearAllMocks();
  });

  it('allows webhook in non-production when secret is missing', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RUNWAY_WEBHOOK_SECRET;
    generationService.handleRunwayWebhook.mockResolvedValue({ ok: true });

    await expect(controller.runwayWebhook(payload, undefined)).resolves.toEqual({ ok: true });
    expect(generationService.handleRunwayWebhook).toHaveBeenCalledWith(payload);
  });

  it('rejects webhook in production when secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RUNWAY_WEBHOOK_SECRET;

    expect(() => controller.runwayWebhook(payload, undefined)).toThrow(BadRequestException);
  });

  it('rejects when signature is missing while secret is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUNWAY_WEBHOOK_SECRET = 'top_secret';

    expect(() => controller.runwayWebhook(payload, undefined)).toThrow(BadRequestException);
  });

  it('rejects invalid signature', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUNWAY_WEBHOOK_SECRET = 'top_secret';

    expect(() => controller.runwayWebhook(payload, 'invalid')).toThrow(BadRequestException);
  });

  it('accepts valid signature', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUNWAY_WEBHOOK_SECRET = 'top_secret';
    generationService.handleRunwayWebhook.mockResolvedValue({ ok: true, status: 'SUCCEEDED' });

    const signature = createHmac('sha256', process.env.RUNWAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    await expect(controller.runwayWebhook(payload, signature)).resolves.toEqual({
      ok: true,
      status: 'SUCCEEDED',
    });
  });
});
