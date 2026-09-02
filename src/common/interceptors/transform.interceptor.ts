import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  statusCode: number;
  timestamp: string;
  path: string;
}

/**
 * Wraps every successful response in a consistent envelope with metadata.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    // The envelope describes an HTTP response. Bot handlers reply through
    // Telegram themselves, so wrapping their return value is meaningless and
    // reading response.statusCode would throw.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data) => ({
        data,
        statusCode: response.statusCode,
        timestamp: new Date().toISOString(),
        path: request.url,
      })),
    );
  }
}
