import { IsOptional, IsEnum, IsInt, Min, IsString, IsUUID, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, OrderPriority } from '@prisma/client';

export class GetOrdersQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Номер страницы',
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
    description: 'Количество элементов на странице',
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
    description: 'Фильтр по статусу',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: OrderPriority,
    example: OrderPriority.HIGH,
    description: 'Фильтр по приоритету',
  })
  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'Фильтр по создателю заказа',
  })
  @IsOptional()
  @IsUUID('4')
  createdById?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'Фильтр по исполнителю заказа',
  })
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional({
    example: 'auth',
    description: 'Поиск по названию или описанию',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Фильтр: дедлайн после этой даты',
  })
  @IsOptional()
  @IsDateString()
  deadlineFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Фильтр: дедлайн до этой даты',
  })
  @IsOptional()
  @IsDateString()
  deadlineTo?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Поле для сортировки',
    enum: ['createdAt', 'updatedAt', 'deadline', 'title', 'priority', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Направление сортировки',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 'true',
    description: 'Только заказы с истекшим дедлайном',
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
    description: 'Только заказы без назначенного исполнителя',
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
    description: 'Список заказов',
  })
  data: any[];

  @ApiPropertyOptional({
    example: {
      total: 100,
      page: 1,
      limit: 10,
      totalPages: 10,
    },
    description: 'Метаданные пагинации',
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
