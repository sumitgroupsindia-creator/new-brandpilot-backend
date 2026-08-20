import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { JwtClaims, Permission, RoleKey, TokenPair, UserStatus } from '@brandpilot/shared';
import { LoginDto, RegisterDto } from '@brandpilot/shared';
import * as crypto from 'crypto';
import { ulid } from 'ulid';
import { OutboxService } from '../outbox/outbox.service';
import { normalizeJwtKey } from '../common/jwt-key';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly outboxService: OutboxService,
  ) {}

  async register(dto: RegisterDto, tenantId: string, ipAddress?: string): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name ?? null,
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifyToken: verifyToken,
      },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    // Assign default USER role
    const userRole = await this.prisma.role.findUnique({
      where: { tenantId_key: { tenantId, key: RoleKey.USER } },
    });
    if (userRole) {
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    await this.outboxService.enqueue({
      tenantId,
      userId: user.id,
      topic: 'auth.verify_email',
      dedupeKey: `verify:${tenantId}:${user.id}:${verifyToken}`,
      payload: {
        email: user.email,
        token: verifyToken,
        verifyUrl: `${this.getPublicAppBaseUrl()}/auth/verify-email?token=${verifyToken}`,
      },
    });

    return this.createTokenPair(user as any, ipAddress);
  }

  async login(dto: LoginDto, tenantId: string, ipAddress?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'Account is suspended or deleted',
      });
    }

    const valid = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    return this.createTokenPair(user as any, ipAddress, dto.deviceName, dto.deviceInfo as Record<string, unknown>);
  }

  async refresh(refreshToken: string, ipAddress?: string): Promise<TokenPair> {
    const rotated = await this.sessionService.rotateSession(refreshToken, undefined, ipAddress);
    if (!rotated) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Session expired or revoked',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_INVALID',
        message: 'Account is no longer active',
      });
    }

    return this.issueTokens(user as any, rotated.token, rotated.expiresAt);
  }

  async verifyEmail(token: string, tenantId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, emailVerifyToken: token },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired verification token',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        emailVerifyToken: null,
      },
    });
  }

  async forgotPassword(email: string, tenantId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
    });
    if (!user) return; // don't reveal existence

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    await this.outboxService.enqueue({
      tenantId,
      userId: user.id,
      topic: 'auth.reset_password',
      dedupeKey: `reset:${tenantId}:${user.id}:${token}`,
      payload: {
        email: user.email,
        token,
        resetUrl: `${this.getPublicAppBaseUrl()}/auth/reset-password?token=${token}`,
      },
    });
  }

  async resetPassword(token: string, newPassword: string, tenantId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        passwordResetToken: token,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token',
      });
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.updateMany({
      where: { refreshHash: hash },
      data: { revokedAt: new Date() },
    });
  }

  private async createTokenPair(
    user: any,
    ipAddress?: string,
    deviceName?: string,
    deviceInfo?: Record<string, unknown>,
  ): Promise<TokenPair> {
    const session = await this.sessionService.createSession(
      user.id,
      user.tenantId,
      deviceName,
      deviceInfo,
      ipAddress,
    );
    return this.issueTokens(user, session.token, session.expiresAt);
  }

  private issueTokens(user: any, refreshToken: string, refreshExpiresAt: Date): TokenPair {
    const roles = user.roles.map((ur: any) => ur.role.key as RoleKey);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur: any) =>
          ur.role.permissions.map((rp: any) => rp.permission.key as Permission),
        ),
      ),
    ) as Permission[];

    const jti = ulid();
    const accessTtlSec = this.configService.get<number>('AUTH_ACCESS_TTL_SEC', 900);

    const claims: JwtClaims = {
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles,
      perms: permissions,
      sid: jti,
      jti,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + accessTtlSec,
    };

    const accessToken = this.jwtService.sign(claims, {
      privateKey: normalizeJwtKey(this.configService.get<string>('JWT_PRIVATE_KEY')),
      algorithm: 'RS256',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtlSec,
    };
  }

  private getPublicAppBaseUrl() {
    // WEB_APP_URL is a comma-separated CORS allowlist, so it can't be used as a
    // URL directly — doing that produced verify/reset links with every allowed
    // origin concatenated into the host. PUBLIC_APP_URL names the canonical
    // user-facing app; otherwise fall back to the first allowlisted origin.
    // APP_BASE_URL is deliberately not used here: it points at the API itself,
    // not at the web app these links must open.
    const explicit = this.configService.get<string>('PUBLIC_APP_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }

    const firstAllowedOrigin = (this.configService.get<string>('WEB_APP_URL') ?? '')
      .split(',')[0]
      ?.trim()
      .replace(/\/+$/, '');

    return firstAllowedOrigin || 'http://localhost:5173';
  }
}
