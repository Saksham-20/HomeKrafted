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
 * There is deliberately **no seller-facing equivalent**. A HomeKrafter
 * moving their own pin changes who can buy from them, which is the same
 * class of self-granted advantage as setting their own verification
 * badge (M16) — and unlike the badge it would be invisible on every
 * screen. It stays an audited admin action.
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
