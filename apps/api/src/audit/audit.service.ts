import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  actorId?: string;
  actorEmail?: string;
  tenantId?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const ctx = this.tenantContext.get();
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? ctx?.tenantId ?? null,
        actorId: entry.actorId ?? ctx?.userId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: (entry.before as any) ?? null,
        after: (entry.after as any) ?? null,
        reason: entry.reason ?? null,
        ipAddress: entry.ipAddress ?? null,
        correlationId: ctx?.correlationId ?? null,
      },
    });
  }
}
