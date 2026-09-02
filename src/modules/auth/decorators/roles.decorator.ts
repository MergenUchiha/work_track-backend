import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may call an endpoint. Enforced by RolesGuard.
 *
 * @example
 * ```typescript
 * @Get('admin-only')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN)
 * adminOnly() {
 *   return 'Only admins can access this';
 * }
 *
 * @Get('managers-and-admins')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN, UserRole.MANAGER)
 * managersAndAdmins() {
 *   return 'Admins and managers can access this';
 * }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
