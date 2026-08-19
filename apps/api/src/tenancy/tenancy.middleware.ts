import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtClaims, RoleKey } from '@brandpilot/shared';
import { TenantContextService } from './tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';

export const ACT_AS_TENANT_HEADER = 'x-act-as-tenant';
export const TENANT_SLUG_HEADER = 'x-tenant-slug';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let tenantId: string | null = null;
    let userId: string | undefined;
    let roles: string[] = [];
    let permissions: string[] = [];

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = this.jwtService.verify<JwtClaims>(token, {
          publicKey: this.configService.get<string>('JWT_PUBLIC_KEY')?.replace(/\\n/g, '\n'),
          algorithms: ['RS256'],
          clockTolerance: 30,
        });

        tenantId = payload.tid;
        userId = payload.sub;
        roles = payload.roles ?? [];
        permissions = payload.perms ?? [];

        // Super-admin can act as another tenant
        if (roles.includes(RoleKey.SUPER_ADMIN)) {
          const actAs = req.headers[ACT_AS_TENANT_HEADER] as string | undefined;
          if (actAs) {
            tenantId = actAs;
            // Audit impersonation via act claim already in JWT; here we just scope
          }
        }

        (req as Request & { user?: JwtClaims }).user = payload;
      } catch (err) {
        // Allow public routes to continue; guards will reject protected routes
      }
    }

    // Resolve tenant for public endpoints (register/login/etc.)
    if (!tenantId) {
      const tenantSlug = req.headers[TENANT_SLUG_HEADER] as string | undefined;
      if (tenantSlug) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: tenantSlug },
          select: { id: true },
        });
        if (tenant) {
          tenantId = tenant.id;
        }
      }
    }

    if (tenantId) {
      (req as Request & { tenantId?: string }).tenantId = tenantId;
    }

    this.tenantContext.run(
      {
        tenantId,
        userId,
        roles,
        permissions,
        correlationId: (req.headers['x-correlation-id'] as string) ?? undefined,
      },
      () => next(),
    );
  }
}
