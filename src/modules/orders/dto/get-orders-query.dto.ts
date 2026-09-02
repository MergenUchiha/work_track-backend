import { IsOptional, IsEnum, IsInt, Min, IsString, IsUUID, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, OrderPriority } from '@prisma/client';

export class GetOrdersQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    description: 'Items per page',
    minimum: 1,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: OrderStatus,
    example: OrderStatus.IN_PROGRESS,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: OrderPriority,
    example: OrderPriority.HIGH,
    description: 'Filter by priority',
  })
  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'Filter by creator',
  })
  @IsOptional()
  @IsUUID('4')
  createdById?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'Filter by assignee',
  })
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional({
    example: 'auth',
    description: 'Search in title and description',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Deadline on or after this date',
  })
  @IsOptional()
  @IsDateString()
  deadlineFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Deadline on or before this date',
  })
  @IsOptional()
  @IsDateString()
  deadlineTo?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field to sort by',
    enum: ['createdAt', 'updatedAt', 'deadline', 'title', 'priority', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 'true',
    description: 'Only overdue orders',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  overdue?: boolean;

  @ApiPropertyOptional({
    example: 'true',
    description: 'Only unassigned orders',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  unassigned?: boolean;
}

export class PaginatedOrdersDto {
  @ApiPropertyOptional({
    type: [Object],
    description: 'Orders',
  })
  data: any[];

  @ApiPropertyOptional({
    example: {
      total: 100,
      page: 1,
      limit: 10,
      totalPages: 10,
    },
    description: 'Pagination metadata',
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
