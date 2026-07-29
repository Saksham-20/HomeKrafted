import type { Product } from "@/lib/types";
import {
  getProductById as getProductByIdData,
  getProductBySlug,
  products,
} from "@/lib/data";
import { http, isMockMode } from "./http";

/**
 * Products/catalog (M8.4a — real). `GET /products`/`GET /products/:slug`
 * (`docs/API.md` "Commerce (M8.1)") are `@Public()` — no auth header
 * needed, safe to call from a Server Component during SSR. The catalog is
 * small (8 seed products) so `getProducts()` fetches the whole list in one
 * page (`pageSize=100`, comfortably above `total`) rather than wiring real
 * pagination through every call site — `ShopClient`'s own filter/sort/
 * pagination stays entirely client-side over that full list, unchanged.
 * `getProductsByCategory`/`getProductsByOccasion`/`getProductsByVendor`
 * take an *id* (not a slug) at their existing call sites, so — rather than
 * resolving id→slug through an extra round trip to use the server's
 * `?category=slug` query filter — they simply filter the same full list
 * client-side, identical to the pre-M8.4a mock's own filtering logic.
 */

function isBrowsable(product: Product): boolean {
  return product.moderationStatus !== "hidden";
}

interface ProductsPage {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * The browsable catalogue.
 *
 * `near` is the buyer's coordinates. Supplied, the server returns only
 * items from kitchens whose delivery radius actually reaches them, each
 * carrying a `distanceKm`. Omitted — which is the case for anyone who
 * declined the location prompt and hasn't picked an area — the full
 * catalogue comes back, because browsing is never gated on a permission
 * the visitor refused.
 */
export async function getProducts(near?: { lat: number; lng: number }): Promise<Product[]> {
  if (isMockMode()) return products.filter(isBrowsable);
  const page = await http.get<ProductsPage>("/products", {
    auth: false,
    query: { pageSize: 100, ...(near ? { lat: near.lat, lng: near.lng } : {}) },
  });
  return page.items;
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  if (isMockMode()) return getProductBySlug(slug);
  try {
    return await http.get<Product>(`/products/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

/** Lookup by id — the cart store only persists `productId`, so it needs this to resolve a line. No dedicated by-id endpoint; resolves from the full catalog fetch. */
export async function getProductById(id: string): Promise<Product | undefined> {
  if (isMockMode()) return getProductByIdData(id);
  const all = await getProducts();
  return all.find((p) => p.id === id);
}

/** "This week's small batches" home rail — every `featured` product. */
export async function getFeatured(): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.featured && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.featured);
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.categoryId === categoryId && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.categoryId === categoryId);
}

export async function getProductsByOccasion(occasionId: string): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.occasionIds.includes(occasionId) && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.occasionIds.includes(occasionId));
}

export async function getProductsByVendor(vendorId: string): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.vendorId === vendorId && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.vendorId === vendorId);
}
