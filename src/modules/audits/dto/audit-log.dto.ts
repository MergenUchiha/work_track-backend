import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogDto {
  @ApiProperty({
    example: '770e8400-e29b-41d4-a716-446655440001',
    description: 'UUID лога',
  })
  id: string;

  @ApiProperty({
    example: 'STATUS_CHANGED',
    description: 'Тип действия',
  })
  action: string;

  @ApiPropertyOptional({
    example: { status: 'NEW' },
    description: 'Старые значения (до изменения)',
    nullable: true,
  })
  oldValue: any;

  @ApiPropertyOptional({
    example: { status: 'IN_PROGRESS' },
    description: 'Новые значения (после изменения)',
    nullable: true,
  })
  newValue: any;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Дата и время действия',
  })
  createdAt: Date;

  @ApiProperty({
    example: '660e8400-e29b-41d4-a716-446655440001',
    description: 'ID заказа',
  })
  orderId: string;

  @ApiProperty({
    description: 'Информация о заказе',
    example: {
      id: '660e8400-e29b-41d4-a716-446655440001',
      title: 'Разработка модуля',
      status: 'IN_PROGRESS',
    },
  })
  order: {
    id: string;
    title: string;
    status: string;
  };

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'ID пользователя, выполнившего действие',
  })
  changedById: string;

  @ApiProperty({
    description: 'Информация о пользователе',
    example: {
      id: '550e8400-e29b-41d4-a716-446655440003',
      email: 'worker@example.com',
      name: 'Worker User',
      role: 'WORKER',
    },
  })
  changedBy: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}
