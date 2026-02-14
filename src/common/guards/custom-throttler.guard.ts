import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

/**
 * Custom Throttler Guard с поддержкой пропуска для определенных пользователей
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Пропускаем rate limiting для администраторов
    if (user && user.role === 'ADMIN') {
      return true;
    }

    // Пропускаем для health check эндпоинтов
    const url = request.url;
    if (url.includes('/health') || url.includes('/metrics')) {
      return true;
    }

    return false;
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    // Трекаем по user ID если пользователь авторизован
    if (req.user?.sub) {
      return Promise.resolve(`user-${req.user.sub}`);
    }

    // Иначе трекаем по IP
    return Promise.resolve(req.ip || req.socket.remoteAddress);
  }
}
