import { BadRequestException } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  const subscriptionsService = {
    listPlans: jest.fn(),
    getMySubscription: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    handleRazorpaySubscriptionWebhook: jest.fn(),
  } as any;

  const controller = new SubscriptionsController(subscriptionsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires Idempotency-Key for create', async () => {
    await expect(() => controller.create('user_1', { planId: 'plan_1' }, undefined)).toThrow(BadRequestException);
  });

  it('requires Idempotency-Key for cancel', async () => {
    await expect(() => controller.cancel('user_1', undefined)).toThrow(BadRequestException);
  });

  it('requires Idempotency-Key for resume', async () => {
    await expect(() => controller.resume('user_1', undefined)).toThrow(BadRequestException);
  });

  it('passes trimmed idempotency key to create', async () => {
    subscriptionsService.createSubscription.mockResolvedValue({ subscriptionId: 'sub_1' });

    await controller.create('user_1', { planId: 'plan_1' }, '  key_1  ');

    expect(subscriptionsService.createSubscription).toHaveBeenCalledWith('user_1', 'plan_1', 'key_1');
  });

  it('passes trimmed idempotency key to cancel and resume', async () => {
    subscriptionsService.cancelSubscription.mockResolvedValue({ subscriptionId: 'sub_1' });
    subscriptionsService.resumeSubscription.mockResolvedValue({ subscriptionId: 'sub_1' });

    await controller.cancel('user_1', '  key_cancel  ');
    await controller.resume('user_1', '  key_resume  ');

    expect(subscriptionsService.cancelSubscription).toHaveBeenCalledWith('user_1', 'key_cancel');
    expect(subscriptionsService.resumeSubscription).toHaveBeenCalledWith('user_1', 'key_resume');
  });
});
