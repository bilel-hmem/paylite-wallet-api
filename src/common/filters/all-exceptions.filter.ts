import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { QueryFailedError } from 'typeorm';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Every error leaves the API in the same shape, and unexpected errors
 * are logged with their stack but never leaked to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { statusCode, message } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): { statusCode: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ?? exception.message);
      return { statusCode: exception.getStatus(), message };
    }

    // A unique index caught a race the service-level check could not (e.g. same email twice).
    if (
      exception instanceof QueryFailedError &&
      (exception.driverError as { code?: string } | undefined)?.code === 'ER_DUP_ENTRY'
    ) {
      return { statusCode: HttpStatus.CONFLICT, message: 'Resource already exists' };
    }

    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
