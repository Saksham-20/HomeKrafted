import { Prisma } from '@prisma/client';
import { dietaryTagsToFrontend } from '../dietary-tag.util';
import { activeDiscountPct, applyDiscount } from '../vendor-discount';
import { CommissionRate, NO_COMMISSION as NO_MARKUP, markUp } from '../../common/pricing/commission';

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

/**
 * Same basis `ShopClient.tsx`'s `priceOf()` uses — the default weight
 * option's price, **marked up** so the price-range filter and the
 * `price-asc`/`price-desc` sorts work on the number a buyer actually
 * sees. A filter that reads base prices would drop a ₹950 listing out of
 * an "under ₹1,000" search the moment the fee pushed it past the bound.
 *
 * Takes only the narrow shape the phase-one browse query selects, so that
 * read does not have to grow to call it.
 */
export function defaultPriceOf(
  product: { defaultWeightSku: string | null; weightOptions: { sku: string; price: Prisma.Decimal | number }[] },
  rate: CommissionRate,
): number {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  return weight ? markUp(Number(weight.price), rate).buyerPrice : 0;
}

/**
 * A listing as a **buyer** sees it: every price marked up by the
 * commission in force (2026-09-16).
 *
 * `rate` is a required argument and deliberately not defaulted. Stored
 * prices are the maker's base, so a call site that forgot to pass one
 * would under-charge silently on a screen that looks perfectly normal —
 * as a required parameter it is a build error instead. Use
 * `mapProductForMaker` on the two surfaces that legitimately show a maker
 * their own figure.
 */
export function mapProduct(product: ProductWithRelations, rate: CommissionRate) {
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
      /**
       * Buyer-facing, marked up from the stored base (2026-09-16). `mrp`
       * takes the **same** factor: marking up the price and not the
       * struck-through figure would silently change the advertised
       * saving on every listing the moment a rate was set.
       */
      price: markUp(Number(w.price), rate).buyerPrice,
      mrp: markUp(Number(w.mrp), rate).buyerPrice,
      stock: w.stock,
      /**
       * M46. Present only while a discount is running, and computed
       * **server-side** — the client never does this arithmetic, because
       * the number a buyer is shown and the number they are charged have
       * to come from the same place (the M15 refund lesson, and why
       * `resolveCartLine` is the only price authority in the cart).
       *
       * Discount first, then the fee (2026-09-16). The maker funds the
       * discount (M46), so it comes off *their* base; the fee is then
       * charged on what the maker is actually receiving. Charging the fee
       * on the pre-discount base would make the platform's cut larger
       * than the rate says whenever a storefront ran a sale.
       */
      ...(discountPct > 0
        ? { salePrice: markUp(applyDiscount(Number(w.price), discountPct), rate).buyerPrice }
        : {}),
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
    /**
     * G1's three browse-facing answers, carried so a card can state a fact
     * instead of a claim (G3 §5.1).
     *
     * All three are **nullable and sent as-is**. `fulfilment` NULL is "the
     * maker never said", which matches neither Dispatch filter and draws no
     * fact line — the absence-is-not-an-answer rule, one column over. A
     * card that guessed "Ready to ship" from a null would be the platform
     * promising a dispatch date on a maker's behalf.
     */
    fulfilment: product.fulfilment ?? undefined,
    isPersonalisable: product.isPersonalisable,
    // Round-trips with the seller's edit form. Without it the "also list
    // this on my snacks menu" checkbox reads as unticked on a listing that
    // is already on the menu, and saving would quietly take it off.
    isSnack: product.isSnack,
    cashbackPct: Number(product.cashbackPct),
    description: product.description,
    ingredients: product.ingredients ?? undefined,
    // Sent as-is, empty array included: the product page decides what an
    // empty one means (it is "we never asked", never "allergen-free"), and
    // dropping it to `undefined` would hide that difference from the client.
    allergens: product.allergens,
    shelfLife: product.shelfLife ?? undefined,
    storageInstructions: product.storageInstructions ?? undefined,
    disclaimer: product.disclaimer ?? undefined,
    madeIn: product.madeIn ?? undefined,
    dimensions: product.dimensions ?? undefined,
    material: product.material ?? undefined,
    careInstructions: product.careInstructions ?? undefined,
    moderationStatus: product.moderationStatus,
    /**
     * The HomeKrafter's own "am I making this today" switch (2026-09-16).
     *
     * A buyer needs this **and** `moderationStatus` to pass, and this
     * mapper returned only the second — so no screen anywhere could see
     * it. An admin approved a listing, the row read `active`, and it
     * stayed invisible to every buyer with nothing saying why; measured
     * on production, where one approved craft had been re-approved twice
     * and never appeared. A column with no reader is the same bug as a
     * column with no writer (the `mapCategory.icon` lesson, one file
     * over).
     *
     * Public payloads only ever carry `true` — every buyer-facing query
     * filters on it before this runs — so it leaks nothing; it is for the
     * admin queue and the portal, which need to tell the two switches
     * apart.
     */
    isAvailable: product.isAvailable,
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
    /**
     * An admin's place for this listing among the featured ones — lower
     * is earlier. `null` while nobody has ranked it (or it is not
     * featured), kept as `null` rather than dropped so a client can tell
     * "unranked" from "an older server that never sent one".
     */
    featuredRank: product.featuredRank,
  };
}

/**
 * A listing as its **maker** (or an admin editing on their behalf) sees
 * it: prices are the stored base — the figure they typed into the form
 * and the figure they are paid — with the buyer-facing number carried
 * alongside so the portal can show both without doing the arithmetic
 * itself.
 *
 * Two separate functions rather than one with a flag, because the failure
 * mode of getting it wrong is asymmetric: a maker shown a buyer price is
 * confused, a buyer shown a base price is under-charged and the platform
 * eats the fee. A named function is something you have to choose.
 */
export function mapProductForMaker(product: ProductWithRelations, rate: CommissionRate) {
  const discountPct = activeDiscountPct(product.vendor, new Date());

  return {
    ...mapProduct(product, NO_MARKUP),
    weightOptions: product.weightOptions.map((w) => {
      const base = Number(w.price);
      const charged = markUp(discountPct > 0 ? applyDiscount(base, discountPct) : base, rate);
      return {
        sku: w.sku,
        label: w.label,
        price: base,
        mrp: Number(w.mrp),
        stock: w.stock,
        ...(discountPct > 0 ? { salePrice: applyDiscount(base, discountPct) } : {}),
        /** What a buyer is charged for this option right now, fee included. */
        buyerPrice: charged.buyerPrice,
      };
    }),
    /**
     * The fee on the default option, so the listing editor can state it in
     * rupees rather than re-deriving a percentage the server already
     * resolved. Absent when nothing is charged.
     */
    ...(rate.enabled && rate.pct > 0
      ? {
          commission: {
            pct: rate.pct,
            gstPct: rate.gstPct,
          },
        }
      : {}),
  };
}
