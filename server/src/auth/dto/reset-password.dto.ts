import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /auth/password/reset` — the token from the emailed link, plus the new password. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  // Same floor as `RegisterDto`. A reset path with a weaker minimum than
  // registration is a way to downgrade an existing account's password.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;
}
