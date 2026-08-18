import { IsLatitude, IsLongitude } from 'class-validator';

/**
 * `PATCH /seller/profile/coords` — a HomeKrafter pins their own kitchen.
 *
 * This reverses M36's "deliberately no seller-facing equivalent" stance
 * (see `admin/dto/set-vendor-coords.dto.ts`), a product decision made
 * 2026-08-18: the person standing in the kitchen with a GPS fix knows
 * where it is better than an admin reading a pincode centroid that is
 * trustworthy for only 44% of pincodes. What that stance was protecting
 * — a kitchen quietly moving its pin to a busier neighbourhood to widen
 * who can buy from it — is kept closed by three guardrails in
 * `SellerProfileService.setOwnCoords`:
 *
 * 1. **Plausibility.** The pin must land within the kitchen's own stated
 *    pincode (centroid + its measured `spreadKm`, plus a margin), or for
 *    a pre-M36 kitchen within its curated area. A pin in another city is
 *    refused with the distance in the message.
 * 2. **The badge resets.** Setting a pin clears `addressVerified`, the
 *    same M36c rule every pickup-address edit follows — an admin verified
 *    a place, not a claim, so the admin re-verifies.
 * 3. **It is audited**, same trail as the admin endpoint.
 *
 * The buyer-facing exposure does not change: `mapVendor` rounds public
 * coordinates to ~1.1 km regardless of who set them. The precise pin
 * only ever feeds server-side distance filtering — which is exactly why
 * a kitchen would want it right.
 *
 * No `location` override here, unlike the admin DTO: the public area
 * label stays derived/admin-set, so a pin move cannot also rewrite what
 * neighbourhood the storefront claims to be in.
 */
export class SetOwnCoordsDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
