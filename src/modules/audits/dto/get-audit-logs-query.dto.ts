import { IsOptional, IsInt, Min, IsString, IsUUID, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetAuditLogsQueryDto {
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
    example: '660e8400-e29b-41d4-a716-446655440001',
    description: 'Filter by order',
  })
  @IsOptional()
  @IsUUID('4')
  orderId?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'Filter by acting user',
  })
  @IsOptional()
  @IsUUID('4')
  changedById?: string;

  @ApiPropertyOptional({
    example: 'STATUS_CHANGED',
    description: 'Filter by action type',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Entries on or after this date',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Entries on or before this date',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field to sort by',
    enum: ['createdAt', 'action'],
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
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PaginatedAuditLogsDto {
  @ApiPropertyOptional({
    type: [Object],
    description: 'Audit log entries',
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
