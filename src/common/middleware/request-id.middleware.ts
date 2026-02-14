import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware для добавления уникального ID к каждому запросу
 * Помогает в трейсинге и отладке
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Используем существующий request ID или создаем новый
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Добавляем request ID к объекту запроса
    (req as any).id = requestId;

    // Добавляем request ID в response headers
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
