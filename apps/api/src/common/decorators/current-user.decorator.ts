import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtClaims } from '@brandpilot/shared';

export interface RequestWithUser extends Request {
  user?: JwtClaims;
  tenantId?: string;
  correlationId?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtClaims | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);

export const CurrentTenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.tenantId;
  },
);
