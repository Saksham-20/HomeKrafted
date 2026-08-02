import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  defaultDeliveryRadiusKm?: number;

  /**
   * The hamper builder. Runtime-safe since M17: `GET /settings/public`
   * plus the client's `FeaturesProvider` mean flipping this changes the
   * route gate and all four client call sites at the same time, rather
   * than opening the route and leaving the buttons saying "coming soon"
   * until the next deploy.
   */
  @IsOptional()
  @BooleanField()
  hamperBuilderEnabled?: boolean;
}
