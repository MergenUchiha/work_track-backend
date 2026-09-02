import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CustomLoggerService } from '../../../common/logger/custom-logger.service';
import { JwtPayload } from '../../auth/decorators/current-user.decorator';

/**
 * Logs one line per authenticated HTTP request: method, URL, user, status
 * and duration.
 *
 * Business-level changes (who changed which order field) are recorded
 * separately by AuditsService — this middleware only covers access logging.
 */
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new CustomLoggerService('Audit');

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    res.on('finish', () => {
      const user = req['user'] as JwtPayload | undefined;

      // Anonymous traffic is already covered by the logging interceptor.
      if (!user || !this.shouldLog(req)) {
        return;
      }

      this.logger.log(
        JSON.stringify({
          method: req.method,
          url: req.originalUrl || req.url,
          userId: user.sub,
          userEmail: user.email,
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
        }),
      );
    });

    next();
  }

  /** Skips noise: static assets, health probes and the Swagger UI. */
  private shouldLog(req: Request): boolean {
    if (req.method === 'GET' && req.url.match(/\.(css|js|png|jpg|svg|ico)$/)) {
      return false;
    }

    if (req.url === '/health' || req.url === '/metrics') {
      return false;
    }

    if (req.url.startsWith('/api/docs')) {
      return false;
    }

    return true;
  }
}
