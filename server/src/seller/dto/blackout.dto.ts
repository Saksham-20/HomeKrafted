import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * A day this kitchen is not taking orders (M16, M2).
 *
 * Date-only, `YYYY-MM-DD`. A blackout is a whole day — nobody blocks out
 * 14:00–16:00 on a Tuesday, and the weekly pattern is already
 * `VendorProfile.workingDays`. This is the exception to that, not a
 * second way of expressing it.
 */
export class AddBlackoutDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  /** Shown to buyers on the picker ("Closed — Diwali"), so keep it short. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reason?: string;
}
