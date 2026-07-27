import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Stub social login payload (M8.0) — trusts a client-submitted profile
 * instead of verifying a real provider token/id-token. Flagged in
 * `auth.service.ts#socialLogin`; swapping in real Google/Apple SDK
 * verification in a later milestone only changes the service body, not
 * this DTO's shape (a real verified profile has the same fields).
 */
export class SocialLoginDto {
  @IsString()
  @MinLength(1)
  providerAccountId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
