import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Changes a user's role. Admin only.
 */
export class ChangeRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.MANAGER,
    description: 'New role',
  })
  @IsEnum(UserRole, { message: 'Invalid role. Allowed values: ADMIN, MANAGER, WORKER' })
  role: UserRole;
}
