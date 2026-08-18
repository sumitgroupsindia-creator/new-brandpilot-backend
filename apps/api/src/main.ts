import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor';
import { TenantContextMiddleware } from './tenancy/tenancy.middleware';
import { setupSwagger } from './common/swagger';

async function bootstrap() {
  if (!process.env.GENERATION_WORKER_ENABLED && process.env.NODE_ENV !== 'production') {
    process.env.GENERATION_WORKER_ENABLED = 'true';
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const isProduction = configService.get('NODE_ENV') === 'production';

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser(configService.get('COOKIE_SECRET') ?? 'dev-secret'));
  app.enableCors({
    origin: configService.get('WEB_APP_URL') ?? true,
    credentials: true,
    exposedHeaders: ['X-Correlation-Id', 'X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalInterceptors(new CorrelationInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Tenant context resolution must run before guards
  const tenantMiddleware = app.get(TenantContextMiddleware);
  app.use(tenantMiddleware.use.bind(tenantMiddleware));

  setupSwagger(app);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`BrandPilot API listening on port ${port}`);
}

bootstrap();
