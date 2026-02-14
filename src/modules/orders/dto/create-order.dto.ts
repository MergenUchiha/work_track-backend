import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderPriority } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({
    example: 'Разработка нового модуля аутентификации',
    description: 'Название заказа',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @MinLength(3, { message: 'Название должно содержать минимум 3 символа' })
  @MaxLength(255, { message: 'Название не должно превышать 255 символов' })
  title: string;

  @ApiPropertyOptional({
    example: 'Необходимо реализовать JWT аутентификацию с refresh токенами',
    description: 'Подробное описание заказа',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: OrderPriority,
    example: OrderPriority.MEDIUM,
    description: 'Приоритет заказа',
    default: OrderPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(OrderPriority, {
    message: 'Некорректный приоритет. Доступные: LOW, MEDIUM, HIGH',
  })
  priority?: OrderPriority;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.000Z',
    description: 'Крайний срок выполнения',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Некорректный формат даты' })
  deadline?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'UUID пользователя, которому назначен заказ',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Некорректный формат UUID' })
  assignedToId?: string;
}
