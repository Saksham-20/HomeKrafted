import { Vendor } from '@prisma/client';

export function mapVendor(vendor: Vendor, isFollowing?: boolean) {
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
    lat: vendor.lat,
    lng: vendor.lng,
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
