import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

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

  /**
   * GST the platform charges on its commission fee (2026-09-02) — rides
   * on the fee, applied only while `commissionEnabled` is on.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionGstPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  defaultDeliveryRadiusKm?: number;

  /**
   * Whether payouts deduct the rate above (M37). `@BooleanField()` — the
   * M17 rule: a bare `@IsBoolean()` under `enableImplicitConversion`
   * reads the string "false" as true, which on a money switch is the
   * worst possible coercion.
   */
  @IsOptional()
  @BooleanField()
  commissionEnabled?: boolean;

  /**
   * Comma-separated pincode prefixes Homekrafted currently delivers to —
   * `"160,1401,1403,1341,1346"` is the Chandigarh tricity (M36).
   *
   * Shape is checked in the service rather than by a `@Matches` here, so
   * the message can name the prefix that is wrong. Length capped at a
   * generous 2000: this is a few dozen prefixes even for a national
   * footprint, and an unbounded string on a settings row is a free write
   * amplification.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  servicedPincodePrefixes?: string;

  /**
   * When a delivery date's menu closes, IST, the evening before (M37).
   * Shape (`HH:MM`) is checked in the service so the message can say
   * "like 20:00" rather than reporting a failed regex.
   */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  menuLockTime?: string;
}
