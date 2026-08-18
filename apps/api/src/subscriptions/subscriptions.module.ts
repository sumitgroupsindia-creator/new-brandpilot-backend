import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { RazorpaySubscriptionProvider } from './providers/razorpay-subscription.provider';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, RazorpaySubscriptionProvider],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
