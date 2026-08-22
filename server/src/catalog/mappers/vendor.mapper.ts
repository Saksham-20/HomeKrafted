import { Vendor } from '@prisma/client';

/**
 * Decimal places a **public** payload rounds coordinates to (M36).
 *
 * Two is about 1.1 km — the granularity of "Sector 35, Chandigarh", which
 * is exactly what the `/sell` form promises a buyer sees and no finer.
 * Four decimals is roughly 11 m, i.e. a house.
 *
 * This was harmless until M36 and is not any more. Every vendor's
 * `lat`/`lng` used to be one of 21 curated *area* centroids, so the raw
 * column was already area-grained. M36 took supply national, seeds the
 * column from a pincode centroid, and adds
 * `PATCH /admin/sellers/:id/coords` — whose approval banner tells the
 * operator in as many words to "set the exact spot". The moment an admin
 * does the thing that endpoint exists for, the exact spot of a home
 * cook's kitchen is in an unauthenticated payload, contradicting the
 * promise printed above the box where they typed their address.
 *
 * The column keeps full precision: distance filtering runs server-side
 * against it (`isWithinDelivery`), and nothing on the client computes a
 * distance from the response. Rounding here costs the buyer nothing and
 * closes the leak regardless of what any admin pins later.
 */
const PUBLIC_COORD_DP = 2;

function coarse(value: number): number {
  const factor = 10 ** PUBLIC_COORD_DP;
  return Math.round(value * factor) / factor;
}

export interface MapVendorOptions {
  /**
   * Return coordinates exactly as stored. **Only for a surface that is
   * already authenticated and already entitled to the address** — the
   * admin panel, which owns the coords endpoint, and the HomeKrafter's
   * own portal, which is looking at itself.
   *
   * The default is the safe one on purpose: a new call site added without
   * reading any of this gets the rounded value, and a buyer-facing route
   * cannot leak the exact pin by omission.
   */
  preciseLocation?: boolean;
}

export function mapVendor(
  vendor: Vendor,
  isFollowing?: boolean,
  options?: MapVendorOptions,
) {
  const precise = options?.preciseLocation ?? false;
  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    type: vendor.type,
    bio: vendor.bio,
    avatarPlaceholder: vendor.avatarPlaceholder,
    bannerPlaceholder: vendor.bannerPlaceholder,
    avatarSrc: vendor.avatarSrc ?? undefined,
    bannerSrc: vendor.bannerSrc ?? undefined,
    location: vendor.location,
    // Geography is part of the public shape: the storefront shows where a
    // kitchen is, and `client/lib/types` marks these required — omitting
    // them handed the client `undefined` for fields it type-guarantees.
    area: vendor.area,
    pincode: vendor.pincode ?? undefined,
    // Rounded unless the caller is entitled to the exact pin — see
    // `PUBLIC_COORD_DP`. The buyer gets the neighbourhood, which is all
    // the storefront ever claimed to show.
    lat: precise ? vendor.lat : coarse(vendor.lat),
    lng: precise ? vendor.lng : coarse(vendor.lng),
    deliveryRadiusKm: vendor.deliveryRadiusKm,
    rating: Number(vendor.rating),
    reviewCount: vendor.reviewCount,
    followerCount: vendor.followerCount,
    // No per-viewer follow context on a public browse route yet (`VendorFollow`
    // exists in the schema but M8.1 doesn't add follow endpoints) — always
    // `undefined` here rather than a wrong-looking `false`.
    isFollowing,
    joinedAt: vendor.joinedAt.toISOString(),
  };
}

export function mapCategory(category: {
  id: string;
  slug: string;
  name: string;
  imagePlaceholder: string;
  imageSrc: string | null;
  productCount: number;
  group?: 'food' | 'craft';
  sortOrder?: number;
}) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    imagePlaceholder: category.imagePlaceholder,
    imageSrc: category.imageSrc ?? undefined,
    productCount: category.productCount,
    /**
     * M20. Both of these existed as columns from the day the gifts
     * vertical shipped and neither was ever returned, so every consumer
     * read `group` as absent — which the client resolves to `food`.
     *
     * That made the seller listing form's craft category picker
     * permanently **empty**: a HomeKrafter could choose "Handcrafted
     * gift" and then had nothing to file it under. A column with no
     * reader is the same bug as a column with no writer.
     */
    group: category.group ?? 'food',
    sortOrder: category.sortOrder ?? 0,
  };
}

/**
 * M16 (H8). `celebratedOn` is an absolute date an admin sets, not a
 * recurrence rule — Indian festivals are lunisolar and move against the
 * Gregorian calendar every year, so "repeats on 12 Nov" would be wrong
 * for exactly the occasions that matter most. `null` means evergreen
 * (a birthday has no season), which the hub lists separately rather than
 * sorting into a countdown it doesn't have.
 */
export function mapOccasion(occasion: {
  id: string;
  slug: string;
  name: string;
  initial: string;
  celebratedOn?: Date | null;
  tagline?: string | null;
  imageSrc?: string | null;
}) {
  return {
    id: occasion.id,
    slug: occasion.slug,
    name: occasion.name,
    initial: occasion.initial,
    celebratedOn: occasion.celebratedOn?.toISOString() ?? undefined,
    tagline: occasion.tagline ?? undefined,
    imageSrc: occasion.imageSrc ?? undefined,
  };
}

export function mapCollection(
  collection: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    occasionId: string | null;
    imageSrc?: string | null;
    featured?: boolean;
    sortOrder?: number;
  },
  productIds: string[],
) {
  return {
    id: collection.id,
    slug: collection.slug,
    title: collection.title,
    description: collection.description ?? undefined,
    occasionId: collection.occasionId ?? undefined,
    // M16 (H8) — a collection is a gift guide with its own page now, so
    // it carries its own art and its own place in a running order.
    imageSrc: collection.imageSrc ?? undefined,
    featured: collection.featured ?? false,
    sortOrder: collection.sortOrder ?? 0,
    productIds,
  };
}
