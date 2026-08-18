import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SubscriptionsService } from './subscriptions.service';

class CreateSubscriptionDto {
  planId!: string;
}

class RazorpaySubscriptionWebhookDto {
  providerSubId!: string;
  eventType!: string;
  status!: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  reason?: string;
}

@ApiTags('Subscriptions')
@Controller()
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscription-plans')
  listPlans() {
    return this.subscriptionsService.listPlans();
  }

  @Get('me/subscription')
  me(@CurrentUser('sub') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Post('subscriptions')
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSubscriptionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }
    return this.subscriptionsService.createSubscription(userId, dto.planId, idempotencyKey.trim());
  }

  @Post('subscriptions/cancel')
  cancel(
    @CurrentUser('sub') userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }
    return this.subscriptionsService.cancelSubscription(userId, idempotencyKey.trim());
  }

  @Post('subscriptions/resume')
  resume(
    @CurrentUser('sub') userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }
    return this.subscriptionsService.resumeSubscription(userId, idempotencyKey.trim());
  }

  @Public()
  @Post('webhooks/razorpay/subscription')
  webhook(
    @Body() dto: RazorpaySubscriptionWebhookDto,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    return this.subscriptionsService.handleRazorpaySubscriptionWebhook(dto, signature);
  }
}
