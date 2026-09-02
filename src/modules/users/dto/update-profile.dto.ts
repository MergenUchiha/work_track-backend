import { IsString, IsOptional, MinLength, MaxLength, IsEmail } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a user may change on their own profile.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'John Smith',
    description: 'New name',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(255, { message: 'Name must not exceed 255 characters' })
  name?: string;

  @ApiPropertyOptional({
    example: 'newemail@example.com',
    description: 'New email',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;
}
