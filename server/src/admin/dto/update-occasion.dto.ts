import { IsISO8601, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * `PATCH /admin/occasions/:id` (M16, H8) — the seasonal metadata behind
 * the occasion hub.
 *
 * `celebratedOn` is an absolute date, deliberately not a recurrence rule.
 * Diwali, Raksha Bandhan and Eid are lunisolar and land on a different
 * Gregorian date every year, so a stored `MM-DD` or a "repeats yearly"
 * flag would be wrong for exactly the occasions this feature exists for.
 * Somebody rolls the dates forward each year; that somebody is an admin
 * with this endpoint, not a cron job guessing at a calendar it doesn't
 * understand.
 *
 * `clearCelebratedOn` exists because an omitted optional field means
 * "leave it alone" everywhere else in this codebase, and an occasion that
 * has passed needs a way back to evergreen without inventing a sentinel
 * date.
 */
export class UpdateOccasionDto {
  @IsOptional()
  @IsISO8601()
  celebratedOn?: string;

  @IsOptional()
  @BooleanField()
  clearCelebratedOn?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @MaxLength(500)
  imageSrc?: string;
}
