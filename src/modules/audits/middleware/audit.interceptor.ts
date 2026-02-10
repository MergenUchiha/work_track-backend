import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor для детального логирования запросов и ответов
 * Может использоваться для критичных эндпоинтов
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user;

    const now = Date.now();
    const { method, url, body, params, query } = request;

    // Логируем входящий запрос
    const requestLog = {
      timestamp: new Date().toISOString(),
      method,
      url,
      params,
      query,
      body: this.sanitizeBody(body),
      user: user
        ? {
            id: user.sub,
            email: user.email,
            role: user.role,
          }
        : null,
    };

    console.log('[Audit Interceptor - Request]', JSON.stringify(requestLog, null, 2));

    return next.handle().pipe(
      tap({
        next: (data) => {
          // Логируем успешный ответ
          const responseLog = {
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode: response.statusCode,
            duration: `${Date.now() - now}ms`,
            responseData: this.sanitizeResponse(data),
          };

          console.log(
            '[Audit Interceptor - Response]',
            JSON.stringify(responseLog, null, 2),
          );
        },
        error: (error) => {
          // Логируем ошибку
          const errorLog = {
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode: error.status || 500,
            duration: `${Date.now() - now}ms`,
            error: {
              message: error.message,
              stack: error.stack,
            },
          };

          console.error(
            '[Audit Interceptor - Error]',
            JSON.stringify(errorLog, null, 2),
          );
        },
      }),
    );
  }

  /**
   * Очищаем чувствительные данные из body
   */
  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'passwordHash', 'token', 'refreshToken'];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });

    return sanitized;
  }

  /**
   * Очищаем чувствительные данные из ответа
   */
  private sanitizeResponse(data: any): any {
    if (!data) return data;

    // Для массивов
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeResponse(item));
    }

    // Для объектов
    if (typeof data === 'object') {
      const sanitized = { ...data };
      const sensitiveFields = ['passwordHash', 'refreshToken'];

      sensitiveFields.forEach((field) => {
        if (sanitized[field]) {
          sanitized[field] = '***REDACTED***';
        }
      });

      return sanitized;
    }

    return data;
  }
}