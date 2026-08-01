import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Platform settings (M16, M5). Every field optional — an admin changing
 * the commission rate shouldn't have to resend the feature flags, and an
 * omitted field means "leave it alone" the way it does everywhere else in
 * this codebase.
 *
 * Ranges are enforced again in `AdminSettingsService.update`, because a
 * take rate over 100% or a negative one is a typo rather than a setting
 * and that boundary should not depend on which door the value came in
 * through.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  defaultDeliveryRadiusKm?: number;
}
