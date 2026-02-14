import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh токен для получения новой пары токенов',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh токен обязателен' })
  refreshToken: string;
}
