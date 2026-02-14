import { IsString, IsOptional, IsEnum, MinLength, MaxLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderPriority } from '@prisma/client';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    example: 'Обновлённое название заказа',
    description: 'Новое название заказа',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Название должно содержать минимум 3 символа' })
  @MaxLength(255, { message: 'Название не должно превышать 255 символов' })
  title?: string;

  @ApiPropertyOptional({
    example: 'Обновлённое описание заказа',
    description: 'Новое описание заказа',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: OrderPriority,
    example: OrderPriority.HIGH,
    description: 'Новый приоритет заказа',
  })
  @IsOptional()
  @IsEnum(OrderPriority, {
    message: 'Некорректный приоритет. Доступные: LOW, MEDIUM, HIGH',
  })
  priority?: OrderPriority;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.000Z',
    description: 'Новый крайний срок выполнения',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Некорректный формат даты' })
  deadline?: string;
}
