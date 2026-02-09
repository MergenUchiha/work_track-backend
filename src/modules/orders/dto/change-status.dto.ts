import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class ChangeStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    example: OrderStatus.IN_PROGRESS,
    description: 'Новый статус заказа',
  })
  @IsEnum(OrderStatus, {
    message: 'Некорректный статус. Доступные: NEW, IN_PROGRESS, DONE, CANCELLED',
  })
  status: OrderStatus;
}