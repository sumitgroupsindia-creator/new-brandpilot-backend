import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GENERATION_PROCESS_JOB, GENERATION_QUEUE_NAME } from './generation.constants';

export interface GenerationQueuePayload {
  assetId: string;
}

@Injectable()
export class GenerationQueueService implements OnModuleDestroy {
  private readonly queue: Queue<GenerationQueuePayload>;

  constructor() {
    this.queue = new Queue<GenerationQueuePayload>(GENERATION_QUEUE_NAME, {
      connection: {
        url: process.env.REDIS_URL,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }

  async enqueue(assetId: string) {
    await this.queue.add(
      GENERATION_PROCESS_JOB,
      { assetId },
      {
        jobId: assetId,
      },
    );
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
