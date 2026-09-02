import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Exclude } from 'class-transformer';

/**
 * Public representation of a user, without sensitive fields.
 */
export class UserDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'User UUID',
  })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email',
  })
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Full name',
  })
  name: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.WORKER,
    description: 'Role',
  })
  role: UserRole;

  @ApiProperty({
    example: true,
    description: 'Active status',
  })
  isActive: boolean;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Created at',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Last updated at',
  })
  updatedAt: Date;

  // passwordHash is never exposed
  @Exclude()
  passwordHash?: string;

  constructor(partial: Partial<UserDto>) {
    Object.assign(this, partial);
  }
}
