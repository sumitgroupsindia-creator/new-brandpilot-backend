import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './prisma-pool';

/**
 * Prisma 7 has no Rust query engine — the driver adapter owns the connection
 * pool instead. That is the reason for the upgrade: the old engine ran a tokio
 * worker pool that exceeded the process/thread cap on shared hosting and failed
 * with a continuous stream of "PANIC: timer has gone away".
 *
 * The pool is configured explicitly rather than through URL query parameters,
 * because Prisma 6's `connection_limit`/`pool_timeout` parameters are not read
 * by the mariadb driver and would silently do nothing.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const shouldLogQueries = process.env.PRISMA_LOG_QUERIES === 'true';
    const baseDevLogs: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];

    super({
      adapter: createPrismaAdapter(),
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
