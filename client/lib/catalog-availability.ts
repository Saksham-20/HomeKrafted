import type { Product } from "@/lib/types";

/**
 * Single source of truth predicate for whether a listing is visible in the public catalog.
 *
 * Implements P0-05:
 * A listing is ONLY visible if:
 * 1. Moderation status is 'active' (or undefined on legacy seed rows) — never 'pending', 'rejected', 'hidden', or 'flagged'.
 * 2. `isAvailable !== false` (not paused by the seller).
 */
export function isCatalogVisible(product: Product): boolean {
  if (product.moderationStatus && product.moderationStatus !== "active") {
    return false;
  }
  if (product.isAvailable === false) {
    return false;
  }
  return true;
}

/**
 * Whether the product has purchasable inventory on hand.
 */
export function hasStock(product: Product): boolean {
  if (product.weightOptions && product.weightOptions.length > 0) {
    return product.weightOptions.some((w) => w.stock > 0);
  }
  return true;
}

/**
 * Whether the product is actively purchasable right now (visible + in stock).
 */
export function isPurchasable(product: Product): boolean {
  return isCatalogVisible(product) && hasStock(product);
}

/**
 * Filters products for buy-led public surfaces (e.g. Homepage Bestsellers, Trending,
 * and Hero carousels). Sold-out products must never be featured in active buying rails.
 */
export function filterPurchasableListings(products: Product[]): Product[] {
  return products.filter(isPurchasable);
}

