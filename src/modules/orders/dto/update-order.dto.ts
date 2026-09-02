import { IsString, IsOptional, IsEnum, MinLength, MaxLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderPriority } from '@prisma/client';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    example: 'Updated order title',
    description: 'New title',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated order description',
    description: 'New description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: OrderPriority,
    example: OrderPriority.HIGH,
    description: 'New priority',
  })
  @IsOptional()
  @IsEnum(OrderPriority, {
    message: 'Invalid priority. Allowed values: LOW, MEDIUM, HIGH',
  })
  priority?: OrderPriority;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.000Z',
    description: 'New deadline',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Invalid date format' })
  deadline?: string;
}
