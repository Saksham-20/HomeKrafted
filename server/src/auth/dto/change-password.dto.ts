import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /auth/password/change` — an authenticated password change.
 *
 * The current password is required even though the caller already holds a
 * valid session (M32). Two reasons, and the second is the one this
 * endpoint exists for: a borrowed unlocked laptop should not be able to
 * take an account over, and — since this is the screen a newly approved
 * HomeKrafter lands on holding an admin-issued temporary password — the
 * person setting the new password should be the person who was given the
 * old one.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  // Same floor as `RegisterDto` and `ResetPasswordDto`. A change path with
  // a weaker minimum than registration is a way to downgrade a password.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  newPassword!: string;
}
