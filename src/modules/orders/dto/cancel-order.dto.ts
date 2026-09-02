import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelOrderDto {
  @ApiProperty({
    example: 'Requirements withdrawn by the client, the work is no longer needed',
    description: 'Cancellation reason',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Cancellation reason must be at least 10 characters' })
  reason: string;
}
