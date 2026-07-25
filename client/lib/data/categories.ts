import type { Category } from "@/lib/types";

/**
 * The 8 "shop by category" tiles from the prototype home page.
 * `productCount` reflects the full implied catalog (the Shop listing
 * copy reads "64 small-batch products…") — not just the 8 seed products
 * below, which mostly slot into these categories anyway.
 */
export const categories: Category[] = [
  { id: "ct1", slug: "pickles", name: "Pickles", imagePlaceholder: "PICKLES", productCount: 12 },
  { id: "ct2", slug: "chutneys", name: "Chutneys", imagePlaceholder: "CHUTNEYS", productCount: 8 },
  { id: "ct3", slug: "cookies", name: "Cookies", imagePlaceholder: "COOKIES", productCount: 10 },
  { id: "ct4", slug: "bakery", name: "Bakery", imagePlaceholder: "BAKERY", productCount: 7 },
  { id: "ct5", slug: "dry-fruits", name: "Dry Fruits", imagePlaceholder: "DRY FRUITS", productCount: 6 },
  { id: "ct6", slug: "chocolates", name: "Chocolates", imagePlaceholder: "CHOCOLATES", productCount: 5 },
  { id: "ct7", slug: "snacks", name: "Snacks", imagePlaceholder: "SNACKS", productCount: 9 },
  { id: "ct8", slug: "hampers", name: "Hampers", imagePlaceholder: "HAMPERS", productCount: 7 },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
