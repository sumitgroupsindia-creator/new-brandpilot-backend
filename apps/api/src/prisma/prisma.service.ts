import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const shouldLogQueries = process.env.PRISMA_LOG_QUERIES === 'true';
    const baseDevLogs: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];

    super({
      log: process.env.NODE_ENV === 'development'
        ? (shouldLogQueries ? ['query', ...baseDevLogs] : baseDevLogs)
        : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
