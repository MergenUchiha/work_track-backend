import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogDto {
  @ApiProperty({
    example: '770e8400-e29b-41d4-a716-446655440001',
    description: 'Entry UUID',
  })
  id: string;

  @ApiProperty({
    example: 'STATUS_CHANGED',
    description: 'Action type',
  })
  action: string;

  @ApiPropertyOptional({
    example: { status: 'NEW' },
    description: 'Values before the change',
    nullable: true,
  })
  oldValue: any;

  @ApiPropertyOptional({
    example: { status: 'IN_PROGRESS' },
    description: 'Values after the change',
    nullable: true,
  })
  newValue: any;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'When the action happened',
  })
  createdAt: Date;

  @ApiProperty({
    example: '660e8400-e29b-41d4-a716-446655440001',
    description: 'Order id',
  })
  orderId: string;

  @ApiProperty({
    description: 'Order summary',
    example: {
      id: '660e8400-e29b-41d4-a716-446655440001',
      title: 'Build the module',
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
    description: 'Id of the user who performed the action',
  })
  changedById: string;

  @ApiProperty({
    description: 'User summary',
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
