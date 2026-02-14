import { IsString, IsOptional, MinLength, MaxLength, IsEmail } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO для обновления профиля пользователя (сам пользователь)
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'John Smith',
    description: 'Новое имя пользователя',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Имя должно содержать минимум 2 символа' })
  @MaxLength(255, { message: 'Имя не должно превышать 255 символов' })
  name?: string;

  @ApiPropertyOptional({
    example: 'newemail@example.com',
    description: 'Новый email пользователя',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Некорректный формат email' })
  email?: string;
}
