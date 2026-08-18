import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetKind } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GenerationService } from './generation.service';

class CreateGenerationJobDto {
  @IsString()
  frameId!: string;

  @IsOptional()
  @IsString()
  imageId?: string;

  @IsIn(['IMAGE', 'VIDEO'])
  kind!: AssetKind;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsObject()
  frameInputs?: {
    text?: Record<string, string>;
    images?: Record<string, { dataUrl: string; backgroundMode: 'with' | 'without' }>;
  };
}

class RunwayWebhookDto {
  assetId!: string;
  status!: string;
  outputUrl?: string;
  error?: string;
}

@ApiTags('Generation')
@Controller('generation')
@ApiBearerAuth()
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('jobs')
  createJob(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateGenerationJobDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }
    return this.generationService.createJob(userId, dto, idempotencyKey.trim());
  }

  @Get('jobs')
  listJobs(@CurrentUser('sub') userId: string) {
    return this.generationService.listJobs(userId);
  }

  @Get('jobs/:jobId')
  getJob(@CurrentUser('sub') userId: string, @Param('jobId') jobId: string) {
    return this.generationService.getJob(userId, jobId);
  }

  @Public()
  @Post('webhooks/runway')
  runwayWebhook(
    @Body() dto: RunwayWebhookDto,
    @Headers('x-runway-signature') signature?: string,
  ) {
    this.verifyRunwaySignature(dto, signature);
    return this.generationService.handleRunwayWebhook(dto);
  }

  private verifyRunwaySignature(payload: RunwayWebhookDto, signature?: string) {
    const secret = process.env.RUNWAY_WEBHOOK_SECRET;
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

    if (!secret) {
      if (isProd) {
        throw new BadRequestException('Runway webhook secret not configured');
      }
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing runway webhook signature');
    }

    const serializedPayload = JSON.stringify(payload);
    const expected = createHmac('sha256', secret).update(serializedPayload).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new BadRequestException('Invalid runway webhook signature');
    }
  }
}
