import {
  IsOptional,
  IsInt,
  Min,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetAuditLogsQueryDto {
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
    example: '660e8400-e29b-41d4-a716-446655440001',
    description: 'Фильтр по заказу',
  })
  @IsOptional()
  @IsUUID('4')
  orderId?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'Фильтр по пользователю, выполнившему действие',
  })
  @IsOptional()
  @IsUUID('4')
  changedById?: string;

  @ApiPropertyOptional({
    example: 'STATUS_CHANGED',
    description: 'Фильтр по типу действия',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Логи после этой даты',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Логи до этой даты',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Поле для сортировки',
    enum: ['createdAt', 'action'],
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
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PaginatedAuditLogsDto {
  @ApiPropertyOptional({
    type: [Object],
    description: 'Список аудит логов',
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