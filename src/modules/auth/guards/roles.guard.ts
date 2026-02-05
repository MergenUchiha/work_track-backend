import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Guard для проверки ролей пользователя (RBAC)
 * Используется совместно с декоратором @Roles()
 *
 * ВАЖНО: Должен использоваться ПОСЛЕ JwtAuthGuard
 *
 * @example
 * ```typescript
 * @Get('admin-only')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN)
 * adminOnly() {
 *   return 'Only admins';
 * }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Получаем роли из декоратора @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    // Если роли не указаны - пропускаем
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Получаем пользователя из request (добавлен JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw new ForbiddenException('Пользователь не аутентифицирован');
    }

    // Проверяем, есть ли роль пользователя в списке разрешенных
    const hasRole = requiredRoles.includes(user.role as UserRole);

    if (!hasRole) {
      throw new ForbiddenException(
        `Доступ запрещён. Требуется одна из ролей: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}
