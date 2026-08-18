import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OpsService } from './ops.service';

class UpsertNotificationTemplateDto {
  id!: string;
  event!: string;
  channel!: string;
  locale?: string;
  title!: string;
  body!: string;
  active?: boolean;
}

class UpsertSubscriptionPlanDto {
  id?: string;
  name!: string;
  amountInr!: number;
  currency?: string;
  period!: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  premiumFrames?: boolean;
  monthlyCredits?: number;
  graceDays?: number;
  active?: boolean;
  displayOrder?: number;
}

class UploadFrameDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(['FREE', 'PREMIUM'])
  tier?: 'FREE' | 'PREMIUM';

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  estimatedCredits?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  isFeatured?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  isTrending?: string;
}

class FrameActiveDto {
  @IsIn(['true', 'false'])
  active!: string;
}

class UpsertFrameCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;
}

class UpsertImageCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;
}

class UploadCategoryImagesDto {
  @IsOptional()
  @IsString()
  namePrefix?: string;

  @IsOptional()
  @IsString()
  metadata?: string;
}

class UpdateCategoryImageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;

  @IsOptional()
  @IsIn(['FREE', 'PREMIUM'])
  tier?: 'FREE' | 'PREMIUM';

  @IsOptional()
  @IsString()
  estimatedCredits?: string;
}

class UpdateFrameTemplateDto {
  @IsOptional()
  dynamicFields?: Array<{
    key?: string;
    label?: string;
    type?: 'text' | 'email' | 'url' | 'tel' | 'image';
    defaultValue?: string;
    supportsBackgroundRemoval?: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    font?: string;
    fontSize?: number;
    color?: string;
    lineHeight?: number;
    justification?: string;
  }>;
}

@ApiTags('Ops')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('dashboard')
  dashboard() {
    return this.opsService.getDashboard();
  }

  @Get('users')
  users() {
    return this.opsService.listUsers();
  }

  @Get('jobs/failed')
  failedJobs() {
    return this.opsService.listFailedJobs();
  }

  @Get('audit')
  audit() {
    return this.opsService.listAudit();
  }

  @Get('frames')
  frames() {
    return this.opsService.listFrames();
  }

  @Post('frames/upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'frameZip', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 25 * 1024 * 1024,
        },
      },
    ),
  )
  uploadFrame(
    @UploadedFiles()
    files: {
      frameZip?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
    @Body() dto: UploadFrameDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.uploadFrame(userId, dto, files);
  }

  @Patch('frames/:frameId/active')
  setFrameActive(
    @Param('frameId') frameId: string,
    @Body() dto: FrameActiveDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.setFrameActive(frameId, dto.active === 'true', userId);
  }

  @Get('frames/:frameId')
  frameById(@Param('frameId') frameId: string): Promise<any> {
    return this.opsService.getFrame(frameId);
  }

  @Patch('frames/:frameId/template')
  updateFrameTemplate(
    @Param('frameId') frameId: string,
    @Body() dto: UpdateFrameTemplateDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.updateFrameTemplate(frameId, userId, {
      dynamicFields: dto.dynamicFields,
    });
  }

  @Get('categories')
  categories() {
    return this.opsService.listCategories();
  }

  @Get('frame-categories')
  frameCategories() {
    return this.opsService.listCategories();
  }

  @Post('frame-categories')
  createFrameCategory(
    @Body() dto: UpsertFrameCategoryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.createFrameCategory(userId, {
      name: dto.name,
      parentId: dto.parentId,
      sortOrder: dto.sortOrder,
      active: dto.active,
    });
  }

  @Patch('frame-categories/:categoryId')
  updateFrameCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpsertFrameCategoryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.updateFrameCategory(categoryId, userId, {
      name: dto.name,
      parentId: dto.parentId,
      sortOrder: dto.sortOrder,
      active: dto.active,
    });
  }

  @Delete('frame-categories/:categoryId')
  deleteFrameCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.deleteFrameCategory(categoryId, userId);
  }

  @Patch('frame-categories/:categoryId/active')
  setFrameCategoryActive(
    @Param('categoryId') categoryId: string,
    @Body() dto: FrameActiveDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.setFrameCategoryActive(categoryId, dto.active === 'true', userId);
  }

  @Get('image-categories')
  imageCategories() {
    return this.opsService.listImageCategories();
  }

  @Post('image-categories')
  createImageCategory(
    @Body() dto: UpsertImageCategoryDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.createImageCategory(userId, {
      name: dto.name,
      sortOrder: dto.sortOrder,
      active: dto.active,
    });
  }

  @Patch('image-categories/:categoryId')
  updateImageCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpsertImageCategoryDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.updateImageCategory(categoryId, userId, {
      name: dto.name,
      sortOrder: dto.sortOrder,
      active: dto.active,
    });
  }

  @Delete('image-categories/:categoryId')
  deleteImageCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.deleteImageCategory(categoryId, userId);
  }

  @Patch('image-categories/:categoryId/active')
  setImageCategoryActive(
    @Param('categoryId') categoryId: string,
    @Body() dto: FrameActiveDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.setImageCategoryActive(categoryId, dto.active === 'true', userId);
  }

  @Post('image-categories/:categoryId/images/upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 25 }],
      {
        limits: {
          fileSize: 15 * 1024 * 1024,
        },
      },
    ),
  )
  uploadCategoryImages(
    @Param('categoryId') categoryId: string,
    @UploadedFiles()
    files: {
      images?: Express.Multer.File[];
    },
    @Body() dto: UploadCategoryImagesDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.uploadImageCategoryImages(categoryId, userId, files.images ?? [], {
      namePrefix: dto.namePrefix,
      metadata: dto.metadata,
    });
  }

  @Patch('image-categories/:categoryId/images/:imageId/active')
  setImageActive(
    @Param('categoryId') categoryId: string,
    @Param('imageId') imageId: string,
    @Body() dto: FrameActiveDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.setImageActive(categoryId, imageId, dto.active === 'true', userId);
  }

  @Patch('image-categories/:categoryId/images/:imageId')
  updateImage(
    @Param('categoryId') categoryId: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateCategoryImageDto,
    @CurrentUser('sub') userId: string,
  ): Promise<any> {
    return this.opsService.updateImage(categoryId, imageId, userId, {
      name: dto.name,
      sortOrder: dto.sortOrder,
      active: dto.active,
      tier: dto.tier,
      estimatedCredits: dto.estimatedCredits,
    });
  }

  @Delete('image-categories/:categoryId/images/:imageId')
  deleteImage(
    @Param('categoryId') categoryId: string,
    @Param('imageId') imageId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.deleteImage(categoryId, imageId, userId);
  }

  @Get('wallet-ops')
  walletOps() {
    return this.opsService.listWalletOps();
  }

  @Get('plans')
  plans() {
    return this.opsService.listPlans();
  }

  @Get('subscription-plans')
  subscriptionPlans() {
    return this.opsService.listSubscriptionPlans();
  }

  @Get('subscriptions')
  subscriptions() {
    return this.opsService.listSubscriptions();
  }

  @Get('branding')
  branding() {
    return this.opsService.getBranding();
  }

  @Get('notification-templates')
  notificationTemplates() {
    return this.opsService.listNotificationTemplates();
  }

  @Post('notification-templates')
  upsertNotificationTemplate(
    @Body() dto: UpsertNotificationTemplateDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.upsertNotificationTemplate(userId, dto);
  }

  @Post('subscription-plans')
  upsertSubscriptionPlan(
    @Body() dto: UpsertSubscriptionPlanDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.opsService.upsertSubscriptionPlan(userId, dto);
  }

  @Get('tenants')
  tenants() {
    return this.opsService.listTenants();
  }

  @Post('outbox/process')
  processOutbox() {
    return this.opsService.processOutbox();
  }

  @Get('outbox/status')
  outboxStatus() {
    return this.opsService.outboxStatus();
  }

  @Get('outbox/dead')
  deadOutbox() {
    return this.opsService.deadOutbox();
  }

  @Get('ai-config')
  aiConfig() {
    return this.opsService.getAiConfig();
  }
}
