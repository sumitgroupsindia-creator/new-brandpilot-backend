import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface IdempotencyRequest {
  key: string;
  tenantId: string;
  userId: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async findExisting(
    key: string,
    tenantId: string,
    userId: string,
  ): Promise<{ status: number; body: Record<string, unknown> } | null> {
    const entry = await this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_userId_key: { tenantId, userId, key },
      },
    });
    if (!entry) return null;
    return {
      status: entry.responseStatus,
      body: (entry.responseBody as Record<string, unknown>) ?? {},
    };
  }

  async save(
    req: IdempotencyRequest,
    responseStatus: number,
    responseBody: Record<string, unknown>,
    ttlHours = 24,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.prisma.idempotencyKey.upsert({
      where: {
        tenantId_userId_key: { tenantId: req.tenantId, userId: req.userId, key: req.key },
      },
      update: {
        responseStatus,
        responseBody: responseBody as any,
        requestBody: req.body as any,
        expiresAt,
      },
      create: {
        tenantId: req.tenantId,
        userId: req.userId,
        key: req.key,
        requestMethod: req.method,
        requestPath: req.path,
        requestBody: req.body as any,
        responseStatus,
        responseBody: responseBody as any,
        expiresAt,
      },
    });
  }
}
