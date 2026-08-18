import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { correlationId?: string }>();
    const correlationId =
      (request.headers['x-correlation-id'] as string) ?? uuidv4();
    request['correlationId'] = correlationId;
    request.headers['x-correlation-id'] = correlationId;

    const response = context.switchToHttp().getResponse();
    if (response && typeof response.setHeader === 'function') {
      response.setHeader('X-Correlation-Id', correlationId);
    }

    return next.handle();
  }
}
