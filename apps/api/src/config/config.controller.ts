import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Query,
  NotFoundException,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '@brandpilot/shared';
import { CurrentTenantId, CurrentUser, RequestWithUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

class UpdateConfigDto {
  value!: unknown;
  reason?: string;
  isSecret?: boolean;
}

@ApiTags('Config')
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Get('public')
  async getPublicConfig(@CurrentTenantId() tenantId: string | null) {
    return this.configService.getPublicConfig(tenantId);
  }

  @Get(':namespace')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.CONFIG_MANAGE)
  @ApiBearerAuth()
  async getNamespaceConfig(
    @Param('namespace') namespace: string,
    @CurrentTenantId() tenantId: string | null,
  ) {
    return this.configService.getNamespaceConfig(namespace, tenantId);
  }

  @Put(':namespace/:key')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.CONFIG_MANAGE)
  @ApiBearerAuth()
  async updateConfig(
    @Param('namespace') namespace: string,
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
    @CurrentTenantId() tenantId: string | null,
    @CurrentUser('sub') userId: string,
  ) {
    const fullKey = `${namespace}.${key}`;
    return this.configService.set(fullKey, dto.value, {
      tenantId,
      updatedBy: userId,
      reason: dto.reason,
      isSecret: dto.isSecret,
    });
  }
}
