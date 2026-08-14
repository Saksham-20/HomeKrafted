/**
 * Indian pincodes — which ones exist, and where they roughly are.
 *
 * This is what makes Homekrafted's supply side national (M36). Before it,
 * `SellerApplication.area` was a closed list of 21 hand-curated tricity
 * areas plus the literal `'other'`, and `'other'` could not be approved:
 * a home cook in Faridabad submitted the public form, landed on a
 * waitlist, and no screen in the product could move them off it. Any
 * valid pincode now resolves, so an application is never unapprovable
 * for being outside the launch city.
 *
 * Data: GeoNames (https://download.geonames.org/export/zip/IN.zip),
 * **CC-BY 4.0** — regenerate with `node scripts/build-pincodes.mjs`. The
 * licence obliges a visible credit linking to www.geonames.org; it is in
 * the site footer. Removing the credit while keeping the table is a
 * licence breach, not a tidy-up.
 *
 * ---------------------------------------------------------------------
 * THE ONE THING TO KNOW BEFORE USING THIS
 *
 * `district` and `state` are reliable. **`lat`/`lng` are a seed, not an
 * answer.** Only 44% of pincodes have a trustworthy centroid; the median
 * pincode's post offices are 12.4 km apart, and the worst are hundreds of
 * kilometres apart. Pincode 134109 lands ~11 km from Panchkula Sector 8.
 * Pincode 160055 spans Mohali and Rupnagar, so its mean is a field
 * between two cities.
 *
 * So:
 *
 * - **Never write these coordinates straight onto `Vendor.lat`/`lng`.**
 *   That column decides which buyers can see a kitchen at all, through
 *   `isWithinDelivery`. A 12 km error there silently hides a real
 *   storefront from its own neighbourhood, or shows it to a city it
 *   cannot deliver to. An admin confirms the point at approval;
 *   `seedCoordsForPincode` exists to give them something to adjust
 *   rather than a blank map.
 * - **`TRICITY_AREAS` in `geo.ts` stays.** Those 21 coordinates are
 *   hand-checked and beat this dump by 1–5 km inside the launch city.
 *   Replacing them with lookups here — which reads like a simplification
 *   — would make the live catalogue's coordinates worse.
 * - **`spreadKm` is the honesty field.** It is how far apart this
 *   pincode's post offices actually are. Ask it before trusting a
 *   centroid; don't assume.
 */

import rawPincodes from './pincodes.json';

export interface PincodeRecord {
  /** Mean of the pincode's post offices. **A seed** — see this file's header. */
  lat: number;
  lng: number;
  district: string;
  state: string;
  /**
   * Widest gap between any two post offices sharing this pincode, in km.
   * `0` means a single post office, so the centroid is exact.
   */
  spreadKm: number;
}

const PINCODES = rawPincodes as Record<string, PincodeRecord>;

/**
 * Above this, a centroid is not worth showing to anybody as a location.
 *
 * 2 km is roughly a delivery radius a home cook would set for "my own
 * neighbourhood", so an error larger than this can flip whether a buyer
 * sees a kitchen at all — which is the decision these coordinates feed.
 */
export const TRUSTWORTHY_SPREAD_KM = 2;

/**
 * Shape only: six digits, and Indian pincodes never start with zero.
 *
 * Deliberately separate from `lookupPincode`. Shape and existence are
 * different questions and they get different answers to the applicant:
 * "that isn't six digits" is a typo, "we don't recognise that pincode"
 * is a data problem they cannot fix by retyping.
 */
export function isPincodeShape(value: string): boolean {
  return /^[1-9]\d{5}$/.test(value.trim());
}

/** The record for a pincode, or `undefined` if India Post has no such code. */
export function lookupPincode(value: string): PincodeRecord | undefined {
  const pin = value.trim();
  return isPincodeShape(pin) ? PINCODES[pin] : undefined;
}

/** `"Panchkula, Haryana"` — what a person recognises, for confirming what they typed. */
export function describePincode(value: string): string | undefined {
  const record = lookupPincode(value);
  return record ? `${record.district}, ${record.state}` : undefined;
}

/**
 * A starting point for the map pin an admin confirms at approval.
 *
 * Named `seed…` rather than `coordsFor…` on purpose: nothing should read
 * this and store the result as a kitchen's location without a human
 * having looked at it. `trustworthy` is passed through so the admin
 * screen can say how far off it might be instead of presenting a guess
 * with the same confidence as a checked address.
 */
export function seedCoordsForPincode(
  value: string,
): { lat: number; lng: number; spreadKm: number; trustworthy: boolean } | undefined {
  const record = lookupPincode(value);
  if (!record) return undefined;
  return {
    lat: record.lat,
    lng: record.lng,
    spreadKm: record.spreadKm,
    trustworthy: record.spreadKm <= TRUSTWORTHY_SPREAD_KM,
  };
}

/** How many pincodes are loaded — used by the unit test to catch an empty or truncated table. */
export function pincodeCount(): number {
  return Object.keys(PINCODES).length;
}
