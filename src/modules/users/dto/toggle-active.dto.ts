import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Blocks or unblocks a user. Admin only.
 */
export class ToggleActiveDto {
  @ApiProperty({
    example: false,
    description: 'Active status (true = active, false = blocked)',
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive: boolean;
}
