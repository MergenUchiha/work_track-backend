import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Декоратор для получения текущего аутентифицированного пользователя из JWT
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: JwtPayload) {
 *   return user;
 * }
 *
 * // Получить только userId
 * @Get('my-id')
 * @UseGuards(JwtAuthGuard)
 * getMyId(@CurrentUser('sub') userId: string) {
 *   return userId;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    return data ? user?.[data] : user;
  }
);
