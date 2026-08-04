import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * Upper bound on either money field. Both land in `Decimal(12,2)` columns,
 * and both were previously unbounded (`@Min(0)` only) on an owner-scoped
 * endpoint — which is what made the uncollected auto-top-up credit worth
 * an unlimited amount rather than a small one. `WalletService.setAutoTopup`
 * now refuses `enabled: true` outright, but the caps stay: whenever
 * auto-top-up is re-enabled behind a real mandate, an uncapped stored rule
 * must not be waiting for it.
 */
const MAX_AUTO_TOPUP_AMOUNT = 25_000;

/** Partial patch — same "merge a partial update" shape as `WalletContext.setAutoTopup` in the mock. Every field optional; unset fields keep their current stored value (or a sane default when no rule row exists yet). */
export class SetAutoTopupDto {
  @IsOptional()
  @BooleanField()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['below-threshold', 'scheduled'])
  trigger?: 'below-threshold' | 'scheduled';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AUTO_TOPUP_AMOUNT)
  thresholdAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AUTO_TOPUP_AMOUNT)
  topupAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMethodRef?: string;
}
