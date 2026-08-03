import { Prisma } from '@prisma/client';
import { dietaryTagsToFrontend } from '../dietary-tag.util';

/**
 * The include shape every catalog query needs to fully serialize a
 * `Product` to the frontend's `Product` shape (`client/lib/types/
 * marketplace.ts`) — kept as one constant so `ProductsService` and
 * `VendorsService` request (and map) the exact same relations.
 */
export const PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  weightOptions: true,
  occasions: { include: { occasion: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** Same basis `ShopClient.tsx`'s `priceOf()` uses — the default weight option's price. */
export function defaultPriceOf(product: ProductWithRelations): number {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  return weight ? Number(weight.price) : 0;
}

export function mapProduct(product: ProductWithRelations) {
  return {
    id: product.id,
    slug: product.slug,
    vendorId: product.vendorId,
    name: product.name,
    categoryId: product.categoryId,
    occasionIds: product.occasions.map((o) => o.occasionId),
    dietary: dietaryTagsToFrontend(product.dietary),
    images: product.images.map((img) => ({
      placeholder: img.placeholder,
      src: img.src ?? undefined,
      ratio: img.ratio,
    })),
    weightOptions: product.weightOptions.map((w) => ({
      sku: w.sku,
      label: w.label,
      price: Number(w.price),
      mrp: Number(w.mrp),
      stock: w.stock,
    })),
    defaultWeightSku: product.defaultWeightSku,
    rating: Number(product.rating),
    reviewCount: product.reviewCount,
    tags: product.tags,
    isPackaged: product.isPackaged,
    isHamper: product.isHamper,
    cashbackPct: Number(product.cashbackPct),
    description: product.description,
    ingredients: product.ingredients ?? undefined,
    shelfLife: product.shelfLife ?? undefined,
    storageInstructions: product.storageInstructions ?? undefined,
    madeIn: product.madeIn ?? undefined,
    moderationStatus: product.moderationStatus,
    featured: product.featured,
  };
}
