import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

export class RegisterDto {
  @TrimmedString(1, 120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  referredByCode?: string;
}
