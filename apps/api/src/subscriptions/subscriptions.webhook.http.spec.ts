import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('Subscriptions webhook route (HTTP)', () => {
  let app: INestApplication;

  const subscriptionsServiceMock = {
    listPlans: jest.fn(),
    getMySubscription: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    handleRazorpaySubscriptionWebhook: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: subscriptionsServiceMock,
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

  it('forwards payload and signature to service', async () => {
    const payload = {
      providerSubId: 'provider_sub_1',
      eventType: 'subscription.charged',
      status: 'ACTIVE',
      currentPeriodEnd: '2026-12-31T00:00:00.000Z',
    };

    subscriptionsServiceMock.handleRazorpaySubscriptionWebhook.mockResolvedValue({
      ok: true,
      subscriptionId: 'sub_1',
      status: 'ACTIVE',
    });

    const res = await request(app.getHttpServer())
      .post('/webhooks/razorpay/subscription')
      .set('x-razorpay-signature', 'sig_123')
      .send(payload)
      .expect(201);

    expect(res.body).toEqual({ ok: true, subscriptionId: 'sub_1', status: 'ACTIVE' });
    expect(subscriptionsServiceMock.handleRazorpaySubscriptionWebhook).toHaveBeenCalledWith(payload, 'sig_123');
  });
});
