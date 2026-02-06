import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Exclude } from 'class-transformer';

/**
 * DTO для представления пользователя (без чувствительных данных)
 */
export class UserDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'UUID пользователя',
  })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Email пользователя',
  })
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Полное имя пользователя',
  })
  name: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.WORKER,
    description: 'Роль пользователя в системе',
  })
  role: UserRole;

  @ApiProperty({
    example: true,
    description: 'Статус активности пользователя',
  })
  isActive: boolean;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Дата создания',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Дата последнего обновления',
  })
  updatedAt: Date;

  // Исключаем passwordHash из ответа
  @Exclude()
  passwordHash?: string;

  constructor(partial: Partial<UserDto>) {
    Object.assign(this, partial);
  }
}