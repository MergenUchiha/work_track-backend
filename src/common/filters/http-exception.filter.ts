import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/** Field names that must never reach the logs in clear text. */
const SENSITIVE_FIELDS = [
  'password',
  'newPassword',
  'oldPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
];

/**
 * Catches every unhandled exception, logs it and returns one consistent
 * error shape to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Bot updates reach this filter too. There is no HTTP response to write
    // to, so log the failure and let the caller's own handler deal with it.
    if (host.getType() !== 'http') {
      this.logger.error(
        `Unhandled exception outside HTTP (${host.getType()})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    // NestJS HTTP exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        error = (exceptionResponse as any).error || exception.name;
      }
    }
    // Known Prisma errors, mapped to sensible HTTP statuses
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      error = prismaError.error;
    }
    // Prisma validation errors
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Data validation error';
      error = 'Validation Error';
    }
    // Anything else
    else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    const errorLog = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      statusCode: status,
      error,
      message,
      ...(!isProduction && {
        stack: exception instanceof Error ? exception.stack : undefined,
      }),
      user: (request as any).user
        ? {
            id: (request as any).user.sub,
            email: (request as any).user.email,
          }
        : undefined,
      // Redacted: a failed login would otherwise write the password to the log.
      body: this.redact(request.body),
      query: request.query,
    };

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - ${status}`,
        JSON.stringify(errorLog, null, 2),
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - ${status}`,
        JSON.stringify(errorLog, null, 2),
      );
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error,
      message,
      // Stack traces are for developers, not for clients
      ...(!isProduction &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    };

    response.status(status).json(errorResponse);
  }

  /** Replaces credential-like values with a placeholder before logging. */
  private redact(body: unknown): unknown {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return body;
    }

    const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };

    for (const field of SENSITIVE_FIELDS) {
      if (field in copy) {
        copy[field] = '[REDACTED]';
      }
    }

    return copy;
  }

  /** Maps Prisma error codes to HTTP responses. */
  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = (error.meta?.target as string[]) || [];
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${target.join(', ')} already exists`,
          error: 'Conflict',
        };
      }

      case 'P2025':
        // Record not found
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };

      case 'P2003':
        // Foreign key constraint violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record not found',
          error: 'Bad Request',
        };

      case 'P2014':
        // Required relation violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Operation blocked by related records',
          error: 'Bad Request',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          error: 'Database Error',
        };
    }
  }
}
