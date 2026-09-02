import { IsUUID, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignOrderDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'UUID of the assignee (null to unassign)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid UUID format' })
  assignedToId: string | null;
}
