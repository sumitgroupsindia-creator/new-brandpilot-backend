import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { ConfigModule as AppConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { CatalogModule } from './catalog/catalog.module';
import { OpsModule } from './ops/ops.module';
import { GenerationModule } from './generation/generation.module';
import { WalletModule } from './wallet/wallet.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { OutboxModule } from './outbox/outbox.module';
import { JwtAuthGuard } from './auth/auth.guard';
import { validateEnv } from './common/env.validation';
import { TenantContextMiddleware } from './tenancy/tenancy.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [
        '.env',
        '.env.local',
        '.env.development',
        'apps/api/.env',
        'apps/api/.env.local',
        '../../.env',
        '../../.env.local',
      ],
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    TenancyModule,
    AppConfigModule,
    AuditModule,
    IdempotencyModule,
    AuthModule,
    UsersModule,
    WalletModule,
    NotificationsModule,
    OutboxModule,
    SubscriptionsModule,
    GenerationModule,
    CatalogModule,
    OpsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
