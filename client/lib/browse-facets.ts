import type { DietaryTag, Product, ProductTag } from "@/lib/types";
import type { ShippingScopeFilter } from "@/lib/browse-params";

/**
 * The facet predicates both listing pages filter with (M56). Pure and
 * clock-free so `/shop` and `/gifts` cannot disagree about what "on
 * sale" or "matches these filters" means, and so the rules are testable
 * without a browser (`browse-facets.spec.ts`).
 */

export const DIETARY_OPTIONS: DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "sugar-free",
  "contains-nuts",
];

export const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
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
  if (selection.categories.size && !selection.categories.has(product.categoryId)) return false;
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
