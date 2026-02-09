import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelOrderDto {
  @ApiProperty({
    example: 'Заказчик отменил требования, работа больше не актуальна',
    description: 'Причина отмены заказа',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Причина отмены должна содержать минимум 10 символов' })
  reason: string;
}