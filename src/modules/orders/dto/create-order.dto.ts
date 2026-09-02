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
    example: 'Build the new authentication module',
    description: 'Order title',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @ApiPropertyOptional({
    example: 'Implement JWT authentication with refresh tokens',
    description: 'Detailed description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: OrderPriority,
    example: OrderPriority.MEDIUM,
    description: 'Priority',
    default: OrderPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(OrderPriority, {
    message: 'Invalid priority. Allowed values: LOW, MEDIUM, HIGH',
  })
  priority?: OrderPriority;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.000Z',
    description: 'Deadline',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Invalid date format' })
  deadline?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'UUID of the assignee',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid UUID format' })
  assignedToId?: string;
}
