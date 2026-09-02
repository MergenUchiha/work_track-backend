import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class ChangeStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    example: OrderStatus.IN_PROGRESS,
    description: 'New order status',
  })
  @IsEnum(OrderStatus, {
    message: 'Invalid status. Allowed values: NEW, IN_PROGRESS, DONE, CANCELLED',
  })
  status: OrderStatus;
}
