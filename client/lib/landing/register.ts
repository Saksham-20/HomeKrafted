import type { Product } from "@/lib/types";

/**
 * The landing page's "this week" register — which listings show under
 * which filter. Pure and clock-free (it runs on the server and again in
 * the browser, and the two must agree).
 */

export type RegisterList = "bestsellers" | "trending";
export type RegisterFilter = "all" | "gifts" | "food" | "combos";

export interface RegisterLists {
  bestsellers: { food: Product[]; craft: Product[] };
  trending: { food: Product[]; craft: Product[] };
}

/** A meal combo, bundle, set or hamper — the "Combos" filter. */
export function isComboProduct(product: Product): boolean {
  if (product.isHamper) return true;
  if (product.categoryId === "combos" || product.categoryIds?.includes("combos")) return true;
  if (product.tags?.some((tag) => /combo|bundle|thali|set|box|hamper/i.test(tag))) return true;
  return /combo|thali|bundle|box|set|hamper|pair/i.test(product.name);
}

/**
 * Gifts first, then food, alternating — "All" is a mixed register that
 * leads with the half this page is for.
 */
export function interleave(craft: Product[], food: Product[]): Product[] {
  const out: Product[] = [];
  const length = Math.max(craft.length, food.length);
  for (let index = 0; index < length; index += 1) {
    if (craft[index]) out.push(craft[index]);
    if (food[index]) out.push(food[index]);
  }
  return out;
}

export function registerView(
  lists: RegisterLists,
  list: RegisterList,
  filter: RegisterFilter,
  limit = 8,
): Product[] {
  const { food, craft } = lists[list];
  const all = interleave(craft, food);
  let view: Product[];
  if (filter === "gifts") view = craft;
  else if (filter === "food") view = food;
  else if (filter === "combos") view = all.filter(isComboProduct);
  else view = all;
  return view.slice(0, limit);
}

/** Where "see the rest" goes for each filter. */
export const REGISTER_MORE: Record<RegisterFilter, { href: string; label: string }> = {
  all: { href: "/gifts", label: "See everything" },
  gifts: { href: "/gifts", label: "Browse all gifts" },
  food: { href: "/shop", label: "See all food" },
  combos: { href: "/shop?q=combo", label: "Explore combos & bundles" },
};
