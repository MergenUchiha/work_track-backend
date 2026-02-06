import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO для изменения статуса активности пользователя (только админ)
 */
export class ToggleActiveDto {
  @ApiProperty({
    example: false,
    description: 'Статус активности (true - активен, false - заблокирован)',
  })
  @IsBoolean({ message: 'isActive должно быть boolean значением' })
  isActive: boolean;
}