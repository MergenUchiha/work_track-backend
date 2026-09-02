import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for per-endpoint rate limits.
 */
export const THROTTLE_CUSTOM_KEY = 'throttle_custom';

/**
 * Per-endpoint rate limit.
 */
export interface ThrottleCustomOptions {
  ttl: number; // window in milliseconds
  limit: number; // requests allowed per window
}

/**
 * Applies a custom rate limit to one endpoint.
 *
 * @example
 * ```typescript
 * @Post('login')
 * @ThrottleCustom({ ttl: 900000, limit: 5 }) // 5 attempts per 15 minutes
 * async login(@Body() dto: LoginDto) {
 *   return this.authService.login(dto);
 * }
 * ```
 */
export const ThrottleCustom = (options: ThrottleCustomOptions) =>
  SetMetadata(THROTTLE_CUSTOM_KEY, options);

/**
 * Exempts an endpoint from rate limiting.
 */
export const SkipThrottle = () => SetMetadata('skipThrottle', true);
