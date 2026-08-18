import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationQueueService } from './generation.queue.service';
import { GenerationExecutionService } from './generation.execution.service';
import { GenerationWorkerService } from './generation.worker.service';
import { OpenAiImageProvider } from './providers/openai-image.provider';
import { RunwayVideoProvider } from './providers/runway-video.provider';
import { BackgroundRemovalService } from './background-removal.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [NotificationsModule, SubscriptionsModule],
  controllers: [GenerationController],
  providers: [
    GenerationService,
    GenerationQueueService,
    GenerationExecutionService,
    GenerationWorkerService,
    BackgroundRemovalService,
    OpenAiImageProvider,
    RunwayVideoProvider,
  ],
  exports: [GenerationService],
})
export class GenerationModule {}
