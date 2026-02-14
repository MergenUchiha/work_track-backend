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

/**
 * Глобальный фильтр для обработки всех исключений в приложении
 * Логирует ошибки и возвращает стандартизированный формат ответа
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Внутренняя ошибка сервера';
    let error = 'Internal Server Error';

    // Обработка HTTP исключений (NestJS)
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
    // Обработка ошибок Prisma
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      error = prismaError.error;
    }
    // Обработка ошибок валидации Prisma
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Ошибка валидации данных';
      error = 'Validation Error';
    }
    // Необработанные ошибки
    else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    // Формируем объект ошибки для логирования
    const errorLog = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      statusCode: status,
      error,
      message,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: exception instanceof Error ? exception.stack : undefined,
      }),
      user: (request as any).user
        ? {
            id: (request as any).user.sub,
            email: (request as any).user.email,
          }
        : undefined,
      body: request.body,
      query: request.query,
    };

    // Логируем ошибку
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

    // Формируем ответ
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error,
      message,
      // Добавляем stack trace только в dev режиме
      ...(process.env.NODE_ENV !== 'production' &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    };

    response.status(status).json(errorResponse);
  }

  /**
   * Обработка специфичных ошибок Prisma
   */
  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const target = (error.meta?.target as string[]) || [];
        return {
          status: HttpStatus.CONFLICT,
          message: `Запись с таким ${target.join(', ')} уже существует`,
          error: 'Conflict',
        };

      case 'P2025':
        // Record not found
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Запись не найдена',
          error: 'Not Found',
        };

      case 'P2003':
        // Foreign key constraint violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Связанная запись не найдена',
          error: 'Bad Request',
        };

      case 'P2014':
        // Required relation violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Невозможно выполнить операцию из-за связанных записей',
          error: 'Bad Request',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Ошибка базы данных',
          error: 'Database Error',
        };
    }
  }
}
