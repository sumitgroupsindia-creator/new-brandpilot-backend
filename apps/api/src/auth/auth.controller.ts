import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Delete,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { JwtAuthGuard } from './auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenantId, CurrentUser, RequestWithUser } from '../common/decorators/current-user.decorator';
import { LoginDto, RegisterDto, RefreshDto } from '@brandpilot/shared';

class VerifyEmailDto {
  token!: string;
}

class ForgotPasswordDto {
  email!: string;
}

class ResetPasswordDto {
  token!: string;
  password!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @CurrentTenantId() tenantId: string | null,
    @Req() req: Request,
  ) {
    if (!tenantId) {
      return {
        code: 'TENANT_REQUIRED',
        message: 'Tenant identification is required for registration',
      };
    }
    return this.authService.register(dto, tenantId, this.getIp(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @CurrentTenantId() tenantId: string | null,
    @Req() req: Request,
  ) {
    if (!tenantId) {
      return {
        code: 'TENANT_REQUIRED',
        message: 'Tenant identification is required for login',
      };
    }
    return this.authService.login(dto, tenantId, this.getIp(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, this.getIp(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CurrentTenantId() tenantId: string | null,
  ) {
    if (!tenantId) throw new BadRequestException('Tenant required');
    await this.authService.verifyEmail(dto.token, tenantId);
    return { success: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @CurrentTenantId() tenantId: string | null,
  ) {
    if (!tenantId) throw new BadRequestException('Tenant required');
    await this.authService.forgotPassword(dto.email, tenantId);
    return { success: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @CurrentTenantId() tenantId: string | null,
  ) {
    if (!tenantId) throw new BadRequestException('Tenant required');
    await this.authService.resetPassword(dto.token, dto.password, tenantId);
    return { success: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  async logoutAll(@CurrentUser('sub') userId: string) {
    await this.sessionService.revokeAllUserSessions(userId);
    return { success: true };
  }

  @Get('sessions')
  @ApiBearerAuth()
  async listSessions(@CurrentUser('sub') userId: string) {
    return this.sessionService.listSessions(userId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.sessionService.revokeSession(sessionId, userId);
    return { success: true };
  }

  private getIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip ?? undefined;
  }
}
