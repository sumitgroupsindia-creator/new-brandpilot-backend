import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ulid } from 'ulid';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(
    userId: string,
    tenantId: string,
    deviceName?: string,
    deviceInfo?: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(64).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const familyId = ulid();
    const ttlDays = this.configService.get<number>('AUTH_REFRESH_TTL_DAYS', 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId,
        tenantId,
        refreshHash: hash,
        familyId,
        deviceName,
        deviceInfo: deviceInfo as any,
        ipAddress,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async rotateSession(
    oldToken: string,
    deviceName?: string,
    ipAddress?: string,
  ): Promise<{ token: string; expiresAt: Date; userId: string; tenantId: string } | null> {
    const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');

    return this.prisma.$transaction(async tx => {
      const session = await tx.session.findUnique({
        where: { refreshHash: oldHash },
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return null;
      }

      // Reuse detection: if already rotated, revoke family
      if (session.replacedById) {
        await tx.session.updateMany({
          where: { familyId: session.familyId },
          data: { revokedAt: new Date() },
        });
        return null;
      }

      const newToken = crypto.randomBytes(64).toString('base64url');
      const newHash = crypto.createHash('sha256').update(newToken).digest('hex');
      const ttlDays = this.configService.get<number>('AUTH_REFRESH_TTL_DAYS', 30);
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      const newSession = await tx.session.create({
        data: {
          userId: session.userId,
          tenantId: session.tenantId,
          refreshHash: newHash,
          familyId: session.familyId,
          deviceName: deviceName ?? session.deviceName,
          deviceInfo: session.deviceInfo as any,
          ipAddress: ipAddress ?? session.ipAddress,
          expiresAt,
        },
      });

      await tx.session.update({
        where: { id: session.id },
        data: { replacedById: newSession.id },
      });

      return {
        token: newToken,
        expiresAt,
        userId: session.userId,
        tenantId: session.tenantId,
      };
    });
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string, exceptId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, id: exceptId ? { not: exceptId } : undefined, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }
}
