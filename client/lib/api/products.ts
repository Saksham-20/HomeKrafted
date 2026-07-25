import type { Product } from "@/lib/types";
import {
  featuredProducts,
  getProductById as getProductByIdData,
  getProductBySlug,
  products,
} from "@/lib/data";

/**
 * Client-stub API for products. Every function is `async` and returns
 * mock data today; swapping to real fetch calls in M8 only touches this
 * file — callers already await a Promise.
 */

export async function getProducts(): Promise<Product[]> {
  return products;
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  return getProductBySlug(slug);
}

/** Lookup by id — the cart store only persists `productId`, so it needs this to resolve a line. */
export async function getProductById(id: string): Promise<Product | undefined> {
  return getProductByIdData(id);
}

export async function getFeatured(): Promise<Product[]> {
  return featuredProducts;
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  return products.filter((p) => p.categoryId === categoryId);
}

export async function getProductsByOccasion(occasionId: string): Promise<Product[]> {
  return products.filter((p) => p.occasionIds.includes(occasionId));
}

export async function getProductsByVendor(vendorId: string): Promise<Product[]> {
  return products.filter((p) => p.vendorId === vendorId);
}
