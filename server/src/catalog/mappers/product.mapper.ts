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
    // M20. A client needs both: `kind` decides which detail fields are
    // even meaningful (a candle has no shelf life), and `shippingScope`
    // decides whether "delivers to your area" is the right thing to say.
    kind: product.kind,
    shippingScope: product.shippingScope,
    // Round-trips with the seller's edit form. Without it the "also list
    // this on my snacks menu" checkbox reads as unticked on a listing that
    // is already on the menu, and saving would quietly take it off.
    isSnack: product.isSnack,
    cashbackPct: Number(product.cashbackPct),
    description: product.description,
    ingredients: product.ingredients ?? undefined,
    shelfLife: product.shelfLife ?? undefined,
    storageInstructions: product.storageInstructions ?? undefined,
    madeIn: product.madeIn ?? undefined,
    moderationStatus: product.moderationStatus,
    /**
     * M22. The HomeKrafter's portal reads these to show *why* a listing is
     * not live and what to do about it — the whole point of recording a
     * reason. They ride the shared mapper rather than a portal-only one
     * because the admin queue needs the same three fields, and a second
     * mapper is how two views of one row drift.
     *
     * A buyer never sees them: `pending` and `rejected` listings do not
     * reach a public surface at all (see `catalog/moderation.ts`), so
     * there is no payload a shopper receives carrying a note.
     */
    moderationNote: product.moderationNote ?? undefined,
    moderatedAt: product.moderatedAt?.toISOString(),
    submittedAt: product.submittedAt?.toISOString(),
    featured: product.featured,
  };
}
