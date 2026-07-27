import type { Product } from "@/lib/types";
import {
  getProductById as getProductByIdData,
  getProductBySlug,
  products,
} from "@/lib/data";

/**
 * Client-stub API for products. Every function is `async` and returns
 * mock data today; swapping to real fetch calls in M8 only touches this
 * file — callers already await a Promise.
 */

/**
 * Excludes `moderationStatus: "hidden"` products (an admin take-down,
 * M11b `/admin/catalog`) — a `"flagged"` product stays browsable (flagging
 * just queues it for review), only `"hidden"` is a real soft-delete from
 * every consumer-facing browse surface below. Single-lookup functions
 * (`getProduct`/`getProductById`) deliberately don't apply this filter —
 * an existing cart line, order or wishlist entry must still resolve even
 * if the product's since been taken down. Note: every caller of the
 * functions below runs server-side (these are all Server Components'
 * `lib/api` calls), a separate JS module graph from the browser tab
 * `/admin/catalog`'s client component mutates — see `lib/api/admin.ts`'s
 * "Catalog & review moderation" section header for the full explanation
 * of that boundary.
 */
function isBrowsable(product: Product): boolean {
  return product.moderationStatus !== "hidden";
}

export async function getProducts(): Promise<Product[]> {
  return products.filter(isBrowsable);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  return getProductBySlug(slug);
}

/** Lookup by id — the cart store only persists `productId`, so it needs this to resolve a line. */
export async function getProductById(id: string): Promise<Product | undefined> {
  return getProductByIdData(id);
}

/** "This week's small batches" home rail — every `featured` product (admin-curated, M11b `/admin/catalog`'s feature toggle), not a hardcoded id list. */
export async function getFeatured(): Promise<Product[]> {
  return products.filter((p) => p.featured && isBrowsable(p));
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  return products.filter((p) => p.categoryId === categoryId && isBrowsable(p));
}

export async function getProductsByOccasion(occasionId: string): Promise<Product[]> {
  return products.filter((p) => p.occasionIds.includes(occasionId) && isBrowsable(p));
}

export async function getProductsByVendor(vendorId: string): Promise<Product[]> {
  return products.filter((p) => p.vendorId === vendorId && isBrowsable(p));
}
