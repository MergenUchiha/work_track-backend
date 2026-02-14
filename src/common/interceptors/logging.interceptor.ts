import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Глобальный interceptor для логирования HTTP запросов и ответов
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url, body, query, params } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip || request.socket.remoteAddress;

    const now = Date.now();

    // Логируем входящий запрос
    const requestLog = {
      timestamp: new Date().toISOString(),
      method,
      url,
      userAgent,
      ip,
      query,
      params,
      body: this.sanitizeBody(body),
      user: (request as any).user
        ? {
            id: (request as any).user.sub,
            email: (request as any).user.email,
            role: (request as any).user.role,
          }
        : undefined,
    };

    this.logger.log(`→ ${method} ${url}`, JSON.stringify(requestLog));

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - now;
          const statusCode = response.statusCode;

          const responseLog = {
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            responseSize: JSON.stringify(data).length,
          };

          this.logger.log(
            `← ${method} ${url} ${statusCode} - ${duration}ms`,
            JSON.stringify(responseLog),
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          const statusCode = error.status || 500;

          const errorLog = {
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            error: error.message,
          };

          this.logger.error(
            `← ${method} ${url} ${statusCode} - ${duration}ms`,
            JSON.stringify(errorLog),
          );
        },
      }),
    );
  }

  /**
   * Очищаем чувствительные данные из body
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'secret',
      'apiKey',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
