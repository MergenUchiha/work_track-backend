import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, OrderPriority } from '@prisma/client';

export class OrderCreatorDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: 'admin@example.com' })
  email: string;

  @ApiProperty({ example: 'Admin User' })
  name: string;

  @ApiProperty({ example: 'ADMIN' })
  role: string;
}

export class OrderAssigneeDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440003' })
  id: string;

  @ApiProperty({ example: 'worker@example.com' })
  email: string;

  @ApiProperty({ example: 'Worker User' })
  name: string;

  @ApiProperty({ example: 'WORKER' })
  role: string;
}

export class OrderDto {
  @ApiProperty({
    example: '660e8400-e29b-41d4-a716-446655440001',
    description: 'UUID заказа',
  })
  id: string;

  @ApiProperty({
    example: 'Разработка нового модуля аутентификации',
    description: 'Название заказа',
  })
  title: string;

  @ApiPropertyOptional({
    example: 'Необходимо реализовать JWT аутентификацию',
    description: 'Описание заказа',
  })
  description: string | null;

  @ApiProperty({
    enum: OrderStatus,
    example: OrderStatus.IN_PROGRESS,
    description: 'Текущий статус заказа',
  })
  status: OrderStatus;

  @ApiProperty({
    enum: OrderPriority,
    example: OrderPriority.HIGH,
    description: 'Приоритет заказа',
  })
  priority: OrderPriority;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.000Z',
    description: 'Крайний срок выполнения',
  })
  deadline: Date | null;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Дата создания',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Дата последнего обновления',
  })
  updatedAt: Date;

  @ApiProperty({
    type: OrderCreatorDto,
    description: 'Создатель заказа',
  })
  createdBy: OrderCreatorDto;

  @ApiPropertyOptional({
    type: OrderAssigneeDto,
    description: 'Исполнитель заказа',
    nullable: true,
  })
  assignedTo: OrderAssigneeDto | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Признак просроченного заказа',
  })
  isOverdue?: boolean;
}
