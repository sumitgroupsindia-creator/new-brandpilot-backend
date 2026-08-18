import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtClaims, Permission } from '@brandpilot/shared';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: JwtClaims; tenantId?: string }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      if (isPublic) return true;
      throw new UnauthorizedException({
        code: 'TOKEN_MISSING',
        message: 'Access token is required',
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.verify<JwtClaims>(token, {
        publicKey: this.configService.get<string>('JWT_PUBLIC_KEY'),
        algorithms: ['RS256'],
        clockTolerance: 30,
      });
      request.user = payload;
      request.tenantId = payload.tid;
    } catch (err: any) {
      if (isPublic) return true;
      const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
      throw new UnauthorizedException({ code, message: err.message });
    }

    // Check permissions
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPerms = (request.user.perms ?? []) as Permission[];
      const hasPermission = requiredPermissions.every(p => userPerms.includes(p));
      if (!hasPermission) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        });
      }
    }

    return true;
  }
}
