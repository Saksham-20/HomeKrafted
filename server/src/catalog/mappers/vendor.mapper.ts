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
}) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    imagePlaceholder: category.imagePlaceholder,
    imageSrc: category.imageSrc ?? undefined,
    productCount: category.productCount,
  };
}

export function mapOccasion(occasion: { id: string; slug: string; name: string; initial: string }) {
  return { id: occasion.id, slug: occasion.slug, name: occasion.name, initial: occasion.initial };
}

export function mapCollection(
  collection: { id: string; slug: string; title: string; description: string | null; occasionId: string | null },
  productIds: string[],
) {
  return {
    id: collection.id,
    slug: collection.slug,
    title: collection.title,
    description: collection.description ?? undefined,
    occasionId: collection.occasionId ?? undefined,
    productIds,
  };
}
