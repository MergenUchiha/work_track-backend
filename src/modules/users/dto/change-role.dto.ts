import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * DTO для смены роли пользователя (только админ)
 */
export class ChangeRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.MANAGER,
    description: 'Новая роль пользователя',
  })
  @IsEnum(UserRole, { message: 'Некорректная роль. Доступные: ADMIN, MANAGER, WORKER' })
  role: UserRole;
}
