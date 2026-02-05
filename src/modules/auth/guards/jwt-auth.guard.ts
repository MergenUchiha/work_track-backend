import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

/**
 * Guard для защиты роутов с помощью JWT Access Token
 *
 * @example
 * ```typescript
 * @Controller('users')
 * export class UsersController {
 *   @Get('profile')
 *   @UseGuards(JwtAuthGuard)
 *   getProfile(@CurrentUser() user) {
 *     return user;
 *   }
 * }
 * ```
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Здесь можно добавить дополнительную логику
    // Например, пропускать публичные эндпоинты
    return super.canActivate(context);
  }
}
