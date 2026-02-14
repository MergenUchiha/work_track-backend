import { SetMetadata } from '@nestjs/common';

/**
 * Ключ метаданных для custom rate limiting
 */
export const THROTTLE_CUSTOM_KEY = 'throttle_custom';

/**
 * Интерфейс для custom rate limiting
 */
export interface ThrottleCustomOptions {
  ttl: number; // Время в миллисекундах
  limit: number; // Количество запросов
}

/**
 * Декоратор для установки custom rate limiting на эндпоинт
 *
 * @example
 * ```typescript
 * @Post('login')
 * @ThrottleCustom({ ttl: 900000, limit: 5 }) // 5 попыток в 15 минут
 * async login(@Body() dto: LoginDto) {
 *   return this.authService.login(dto);
 * }
 * ```
 */
export const ThrottleCustom = (options: ThrottleCustomOptions) =>
  SetMetadata(THROTTLE_CUSTOM_KEY, options);

/**
 * Декоратор для пропуска rate limiting на эндпоинте
 */
export const SkipThrottle = () => SetMetadata('skipThrottle', true);
