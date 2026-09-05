import { Prisma } from '@prisma/client';
import { dietaryTagsToFrontend } from '../dietary-tag.util';
import { activeDiscountPct, applyDiscount } from '../vendor-discount';

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
  // M58 — every shelf this listing sits on, the primary included.
  categories: true,
  /**
   * M46 — two columns, so every surface that shows a price can show the
   * HomeKrafter's discount on it.
   *
   * A `select` rather than `true`: this rides on every catalog query, and
   * pulling the whole vendor row would put a kitchen's `lat`/`lng` into
   * the shape of a payload the M36 rounding rule exists to keep out of.
   * Two integers cannot leak an address.
   */
  vendor: { select: { discountPct: true, discountEndsAt: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** Same basis `ShopClient.tsx`'s `priceOf()` uses — the default weight option's price. */
export function defaultPriceOf(product: ProductWithRelations): number {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  return weight ? Number(weight.price) : 0;
}

export function mapProduct(product: ProductWithRelations) {
  // One `now` for the whole product, so two weight tiers of the same
  // listing cannot land on opposite sides of an expiry.
  const discountPct = activeDiscountPct(product.vendor, new Date());

  return {
    id: product.id,
    slug: product.slug,
    vendorId: product.vendorId,
    name: product.name,
    categoryId: product.categoryId,
    occasionIds: product.occasions.map((o) => o.occasionId),
    /**
     * M58. The **extra** shelves, primary excluded — the editors seed
     * their "also show it under" box from this, and including the primary
     * would offer it twice and let it be removed from its own breadcrumb.
     * The join carries the primary; this projection is the one place it is
     * taken back out.
     */
    categoryIds: (product.categories ?? [])
      .map((c) => c.categoryId)
      .filter((id) => id !== product.categoryId),
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
      /**
       * M46. Present only while a discount is running, and computed
       * **server-side** — the client never does this arithmetic, because
       * the number a buyer is shown and the number they are charged have
       * to come from the same place (the M15 refund lesson, and why
       * `resolveCartLine` is the only price authority in the cart).
       */
      ...(discountPct > 0 ? { salePrice: applyDiscount(Number(w.price), discountPct) } : {}),
    })),
    /**
     * The HomeKrafter's storefront discount, when one is running (M46).
     * Absent means no discount rather than zero, so a card can branch on
     * its presence without knowing the rules.
     */
    ...(discountPct > 0 ? { discountPct } : {}),
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
    /**
     * How much notice this listing needs, when its maker said (2026-09-05).
     * `undefined` rather than `null` for "not stated", so the card can
     * branch on presence — and it must, because nothing may be inferred
     * from absence here.
     *
     * **Deliberately not resolved against `VendorProfile.prepTimeMins`.**
     * That is the kitchen's default and it lives on a separate 1:1 row
     * that M16 keeps off listing queries on purpose — joining it here
     * would put a profile fetch on every browse query to decide a badge.
     * It also would not mean what the badge says: the platform default is
     * 90 minutes for a kitchen that has stated nothing, so resolving
     * through it would stamp "Pre-order" on essentially every food
     * listing on the site. The badge is a claim the maker made about
     * *this* dish, or it is not made.
     */
    prepTimeMins: product.prepTimeMins ?? undefined,
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
