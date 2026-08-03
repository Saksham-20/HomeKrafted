import { IsEmail } from 'class-validator';

/**
 * `POST /auth/password/forgot`.
 *
 * Email only, deliberately. A reset that could be requested by phone
 * number would deliver to whatever channel the *requester* named, which is
 * how a reset flow turns into an account-takeover flow.
 */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
