import { IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizedEmail } from '../../common/decorators/normalized-email.decorator';

export class LoginDto {
  @NormalizedEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
