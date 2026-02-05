import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email пользователя'
  })
  @IsEmail({}, { message: 'Некорректный формат email' })
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Пароль пользователя',
    minLength: 6
  })
  @IsString()
  @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' })
  password: string;
}
