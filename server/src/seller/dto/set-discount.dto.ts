import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { MAX_VENDOR_DISCOUNT_PCT, MIN_VENDOR_DISCOUNT_PCT } from '../../catalog/vendor-discount';

/**
 * `PUT /seller/discount` (M46) — a HomeKrafter's own discount on their own
 * listings.
 *
 * **Its own route, not a field on `PATCH /seller/storefront`.** Same rule
 * the M36c write paths follow: the storefront patch is bio, location and
 * artwork, and this one moves money. Keeping them apart is what makes
 * "who changed the price of everything in this kitchen, and when" a
 * question with one answer.
 *
 * `pct: 0` (or omitted with `clear`) turns it off. There is no separate
 * delete route, because "no discount" is a value of this field rather
 * than the absence of a record.
 */
export class SetDiscountDto {
  /** 0 turns it off. Above the ceiling is a 400 rather than a silent clamp — see `MAX_VENDOR_DISCOUNT_PCT`. */
  @IsInt()
  @Min(0)
  @Max(MAX_VENDOR_DISCOUNT_PCT)
  pct!: number;

  /**
   * When it stops, exclusive. Omitted means it runs until turned off,
   * which is a real thing to want ("everything is 10% off, always") and
   * not an unfinished form.
   */
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

/** Re-exported so a reader of this DTO sees the floor without opening another file. */
export { MIN_VENDOR_DISCOUNT_PCT };
