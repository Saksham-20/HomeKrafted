import type { DietaryTag, Product, ProductTag } from "@/lib/types";
import type { ShippingScopeFilter } from "@/lib/browse-params";

/**
 * The facet predicates both listing pages filter with (M56). Pure and
 * clock-free so `/shop` and `/gifts` cannot disagree about what "on
 * sale" or "matches these filters" means, and so the rules are testable
 * without a browser (`browse-facets.spec.ts`).
 */

/**
 * Veg and non-veg lead, because on an Indian food marketplace they are
 * the filter people reach for first and the rest are refinements. Both
 * are `DietaryTag` members like any other (added 2026-09-05) — there is
 * no separate veg column and no tri-state boolean, so the OR-within-a-
 * facet rule below already gives "veg or non-veg" the right meaning.
 *
 * Ticking Veg cannot show an untagged listing, which is the point: a
 * listing whose maker was never asked matches neither box. See
 * `lib/diet.ts` for why absence is never read as an answer.
 */
export const DIETARY_OPTIONS: DietaryTag[] = [
  "vegetarian",
  "non-vegetarian",
  "vegan",
  "contains-egg",
  "gluten-free",
  "sugar-free",
  "contains-nuts",
];

/**
 * The subset the "Veg / Non-veg" quick filter offers, kept apart from
 * the full list so the pill and the sheet cannot drift into offering
 * different things.
 */
export const DIET_MARK_OPTIONS: DietaryTag[] = ["vegetarian", "non-vegetarian"];

export const DIETARY_LABELS: Record<DietaryTag, string> = {
  // "Pure veg" rather than "Vegetarian": it is the phrase every Indian
  // food surface uses, and `KitchenCard` has printed it since M51.
  vegetarian: "Pure veg",
  "non-vegetarian": "Non-veg",
  vegan: "Vegan",
  "contains-egg": "Contains egg",
  "gluten-free": "Gluten-free",
  "sugar-free": "No added sugar",
  "contains-nuts": "Contains nuts",
};

/**
 * Buyer-facing names for the two ways a listing travels. "Ships
 * pan-India" over the raw "national": the fact a buyer cares about is
 * whether it can reach them at all, and "local" on its own reads as a
 * provenance claim rather than a delivery constraint.
 */
export const SHIPPING_LABELS: Record<ShippingScopeFilter, string> = {
  national: "Ships pan-India",
  local: "Fresh, delivered nearby",
};

/**
 * Whether a storefront discount is running on this listing — presence,
 * not arithmetic: `salePrice`/`discountPct` are computed server-side
 * (M46 — no client ever derives a discounted price) and are simply
 * absent when no sale runs.
 */
export function isOnSale(product: Product): boolean {
  return (
    product.discountPct !== undefined ||
    product.weightOptions.some((option) => option.salePrice !== undefined)
  );
}

/**
 * Every shelf a listing sits on — the primary and the M58 extras.
 *
 * **Membership is not identity, and that is the whole reason this is a
 * function.** `Product.categoryId` is the *primary* shelf: the
 * breadcrumb, the canonical URL, what the listing **is**.
 * `Product.categoryIds` is the extras, primary excluded by the mapper so
 * the seller's "also show it under" box never offers it twice. The
 * question "does this listing belong under Sweets" needs both; the
 * question "what does this kitchen make" needs only the primary, which
 * is why `lib/kitchens.ts#buildKitchens` deliberately does **not** call
 * this (a jar filed primary "Pickles" and secondary "For Her" makes
 * pickles — a recipient shelf is not a thing anybody makes).
 *
 * Until 2026-09-06 `productMatchesFacets` tested `categoryId` alone, so
 * every secondary shelf matched nothing and counted nothing, on both
 * listing pages — against CLAUDE.md's M58 contract, which says
 * `ProductCategory` "carries the complete set, primary included ... that
 * is what makes 'everything in this category' one query instead of an OR
 * across two places". The seller form has written `categoryIds` since
 * M58; browse has never read it. A chip therefore showed a count smaller
 * than the catalogue holds and — because a zero-count chip is dimmed
 * **and disabled** — a shelf with only secondary listings on it was an
 * unpressable tile reading 0.
 *
 * Absent on a pre-M58 payload, which correctly reads as "the primary is
 * all we know".
 */
export function productShelves(product: Product): string[] {
  return product.categoryIds?.length
    ? [product.categoryId, ...product.categoryIds]
    : [product.categoryId];
}

/** Whether a listing sits on `categoryId`, primary or secondary. */
export function isOnShelf(product: Product, categoryId: string): boolean {
  return product.categoryId === categoryId || Boolean(product.categoryIds?.includes(categoryId));
}

export interface FacetSelection {
  categories: Set<string>;
  occasions: Set<string>;
  dietary: Set<DietaryTag>;
  tags: Set<ProductTag>;
  sale: boolean;
  shipping: Set<ShippingScopeFilter>;
}

/**
 * OR within a facet, AND across facets — the rule `/shop` has always
 * had, now shared. An empty set means "not narrowing on this". Price is
 * deliberately not here: its bounds come from the loaded product set,
 * which this module knows nothing about.
 */
export function productMatchesFacets(product: Product, selection: FacetSelection): boolean {
  if (
    selection.categories.size &&
    !productShelves(product).some((shelf) => selection.categories.has(shelf))
  ) {
    return false;
  }
  if (selection.dietary.size && !product.dietary.some((tag) => selection.dietary.has(tag)))
    return false;
  if (selection.occasions.size && !product.occasionIds.some((id) => selection.occasions.has(id)))
    return false;
  if (selection.tags.size && !product.tags.some((tag) => selection.tags.has(tag))) return false;
  if (selection.sale && !isOnSale(product)) return false;
  if (selection.shipping.size) {
    // Absent means `local` — everything before M20's column existed was
    // local delivery, and the mapper echoes the DB default.
    const scope = product.shippingScope ?? "local";
    if (!selection.shipping.has(scope)) return false;
  }
  return true;
}
