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
    description: 'Order UUID',
  })
  id: string;

  @ApiProperty({
    example: 'Build the new authentication module',
    description: 'Order title',
  })
  title: string;

  @ApiPropertyOptional({
    example: 'Implement JWT authentication',
    description: 'Description',
  })
  description: string | null;

  @ApiProperty({
    enum: OrderStatus,
    example: OrderStatus.IN_PROGRESS,
    description: 'Current status',
  })
  status: OrderStatus;

  @ApiProperty({
    enum: OrderPriority,
    example: OrderPriority.HIGH,
    description: 'Priority',
  })
  priority: OrderPriority;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.000Z',
    description: 'Deadline',
  })
  deadline: Date | null;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Created at',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Last updated at',
  })
  updatedAt: Date;

  @ApiProperty({
    type: OrderCreatorDto,
    description: 'Creator',
  })
  createdBy: OrderCreatorDto;

  @ApiPropertyOptional({
    type: OrderAssigneeDto,
    description: 'Assignee',
    nullable: true,
  })
  assignedTo: OrderAssigneeDto | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the deadline has passed',
  })
  isOverdue?: boolean;
}
