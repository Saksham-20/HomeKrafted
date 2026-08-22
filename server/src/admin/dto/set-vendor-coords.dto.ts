import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `PATCH /admin/sellers/:id/coords` (M36) — move a kitchen to where it
 * actually is.
 *
 * Approving a pincode application plants the storefront on that
 * pincode's centroid, which is trustworthy for only 44% of Indian
 * pincodes; the median pincode's post offices are 12.4 km apart. That
 * column decides which buyers can see the kitchen at all, so an admin
 * needs a way to correct it. Without this endpoint, going national would
 * mean planting kitchens up to 12 km out with no route back.
 *
 * A seller-facing sibling exists since 2026-08-18 —
 * `PATCH /seller/profile/coords` (`seller/dto/set-own-coords.dto.ts`) —
 * reversing this file's original "no seller-facing equivalent" stance on
 * the owner's decision. What that stance protected (a kitchen quietly
 * moving its pin to a busier neighbourhood) is held closed there by a
 * pincode/area plausibility check, an `addressVerified` reset, and the
 * same audit trail. This admin endpoint remains the unconstrained
 * correction path — it alone may move a pin outside the stated pincode,
 * because an admin can check the claim a kitchen cannot prove.
 */
export class SetVendorCoordsDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  /**
   * The storefront's address line, if the pincode's district is not what
   * a local would call the place. Optional — omitting it leaves whatever
   * approval derived.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;
}
