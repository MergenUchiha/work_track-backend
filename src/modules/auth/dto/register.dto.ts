import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email пользователя'
  })
  @IsEmail({}, { message: 'Некорректный формат email' })
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Полное имя пользователя',
    minLength: 2,
    maxLength: 255
  })
  @IsString()
  @MinLength(2, { message: 'Имя должно содержать минимум 2 символа' })
  @MaxLength(255, { message: 'Имя не должно превышать 255 символов' })
  name: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Пароль (минимум 6 символов, должен содержать буквы и цифры)',
    minLength: 6
  })
  @IsString()
  @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Пароль должен содержать минимум одну букву и одну цифру'
  })
  password: string;
}
