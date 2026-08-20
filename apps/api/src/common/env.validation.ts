import { plainToInstance } from 'class-transformer';
import { IsString, IsOptional, IsNumber, validateSync } from 'class-validator';

class EnvVariables {
  @IsString()
  NODE_ENV: string = 'development';

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  MASTER_ENCRYPTION_KEY!: string;

  @IsString()
  JWT_PRIVATE_KEY!: string;

  @IsString()
  JWT_PUBLIC_KEY!: string;

  @IsString()
  COOKIE_SECRET!: string;

  @IsString()
  @IsOptional()
  APP_BASE_URL?: string;

  @IsString()
  @IsOptional()
  WEB_APP_URL?: string;

  @IsString()
  @IsOptional()
  PUBLIC_APP_URL?: string;

  @IsString()
  @IsOptional()
  RAZORPAY_KEY_ID?: string;

  @IsString()
  @IsOptional()
  RAZORPAY_KEY_SECRET?: string;

  @IsString()
  @IsOptional()
  RAZORPAY_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  GENERATION_WORKER_ENABLED?: string;

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  RUNWAY_API_KEY?: string;

  @IsString()
  @IsOptional()
  OPENAI_IMAGE_MODEL?: string;

  @IsString()
  @IsOptional()
  RUNWAY_MODEL?: string;

  @IsString()
  @IsOptional()
  RUNWAY_API_BASE_URL?: string;

  @IsString()
  @IsOptional()
  RUNWAY_WEBHOOK_SECRET?: string;

  @IsNumber()
  @IsOptional()
  RUNWAY_POLL_TIMEOUT_MS?: number;

  @IsNumber()
  @IsOptional()
  RUNWAY_POLL_INITIAL_INTERVAL_MS?: number;

  @IsNumber()
  @IsOptional()
  RUNWAY_POLL_MAX_INTERVAL_MS?: number;

  @IsNumber()
  @IsOptional()
  RUNWAY_POLL_BACKOFF_MULTIPLIER?: number;

  @IsString()
  @IsOptional()
  OUTBOX_WORKER_ENABLED?: string;

  @IsNumber()
  @IsOptional()
  OUTBOX_POLL_INTERVAL_MS?: number;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsNumber()
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM?: string;

  @IsString()
  @IsOptional()
  SMTP_SECURE?: string;

  @IsString()
  @IsOptional()
  PUSH_PROVIDER_WEBHOOK_URL?: string;

  @IsNumber()
  @IsOptional()
  PORT?: number = 3000;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.map(e => Object.values(e.constraints ?? {})).join(', ')}`);
  }
  return validated;
}
