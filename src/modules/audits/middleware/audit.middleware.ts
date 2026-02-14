import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuditsService } from '../audits.service';

import { JwtPayload } from '../../auth/decorators/current-user.decorator';

/**
 * Middleware для автоматического логирования HTTP запросов
 * Записывает информацию о методе, URL, пользователе и времени выполнения
 */
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(private auditService: AuditsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Сохраняем оригинальные методы
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseBody: any;

    // Перехватываем ответ
    res.json = function (body: any) {
      responseBody = body;
      return originalJson(body);
    };

    res.send = function (body: any) {
      responseBody = body;
      return originalSend(body);
    };

    // Обработка завершения запроса
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const user = req['user'] as JwtPayload;

      // Логируем только для аутентифицированных пользователей
      if (user && this.shouldLog(req)) {
        try {
          const logData = {
            method: req.method,
            url: req.originalUrl || req.url,
            userId: user.sub,
            userEmail: user.email,
            statusCode: res.statusCode,
            duration,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
            timestamp: new Date(),
          };

          // Здесь можно сохранить в отдельную таблицу для HTTP логов
          // или использовать внешний сервис логирования
          console.log('[Audit]', JSON.stringify(logData));
        } catch (error) {
          console.error('[Audit Middleware] Error:', error);
        }
      }
    });

    next();
  }

  /**
   * Определяем, нужно ли логировать запрос
   */
  private shouldLog(req: Request): boolean {
    // Не логируем GET запросы к статическим ресурсам
    if (req.method === 'GET' && req.url.match(/\.(css|js|png|jpg|svg|ico)$/)) {
      return false;
    }

    // Не логируем health check
    if (req.url === '/health' || req.url === '/metrics') {
      return false;
    }

    // Не логируем Swagger документацию
    if (req.url.startsWith('/api/docs')) {
      return false;
    }

    return true;
  }
}
