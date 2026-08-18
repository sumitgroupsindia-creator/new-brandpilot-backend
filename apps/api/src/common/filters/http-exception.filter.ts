import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
  correlationId?: string;
  meta?: Record<string, unknown>;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const correlationId =
      (request.headers['x-correlation-id'] as string) ??
      (request['correlationId'] as string) ??
      'unknown';

    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let meta: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        code = (obj.code as string) ?? code;
        meta = (obj.meta as Record<string, unknown>) ?? undefined;
      }
    }

    const problem: ProblemDetails = {
      type: `https://errors.brandpilot.app/${code.toLowerCase()}`,
      title: message,
      status,
      detail: message,
      code,
      instance: request.url,
      correlationId,
      meta,
    };

    if (status >= 500) {
      this.logger.error(
        { err: exception instanceof Error ? exception.message : String(exception), correlationId },
        `Server error: ${message}`,
      );
    } else {
      this.logger.warn({ status, code, correlationId }, `Client error: ${message}`);
    }

    response.status(status).json(problem);
  }
}
