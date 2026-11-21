import { compareTopRated } from "@/lib/home-rails";
import type { Category, Product } from "@/lib/types";

/**
 * A small, deterministic festive edit for the landing page.
 *
 * The first three slots deliberately represent the mix requested by the
 * owner — hamper, candle, crochet — when those live listings exist. The
 * rest prefer Diwali-tagged gifts, then other handcrafted gifts. No random
 * shuffle and no hard-coded product ids, so production data can replace the
 * fixtures without silently emptying the section.
 */
export function festiveGiftEdit(
  products: readonly Product[],
  categories: readonly Category[],
  diwaliOccasionId?: string,
  limit = 12,
): Product[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const searchable = (product: Product) => {
    const category = categoryById.get(product.categoryId);
    return [
      product.name,
      category?.name,
      category?.slug,
      ...(product.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  };

  const candidates = products
    .filter((product) => product.kind === "craft" || product.isHamper || /hamper/i.test(searchable(product)))
    .slice()
    .sort((a, b) => {
      if (diwaliOccasionId) {
        const aDiwali = a.occasionIds.includes(diwaliOccasionId) ? 1 : 0;
        const bDiwali = b.occasionIds.includes(diwaliOccasionId) ? 1 : 0;
        if (aDiwali !== bDiwali) return bDiwali - aDiwali;
      }
      return compareTopRated(a, b);
    });
  const picked: Product[] = [];
  const seen = new Set<string>();
  const takeFirst = (predicate: (product: Product) => boolean) => {
    const item = candidates.find((product) => !seen.has(product.id) && predicate(product));
    if (!item) return;
    picked.push(item);
    seen.add(item.id);
  };

  takeFirst((product) => product.isHamper === true);
  if (picked.length === 0) takeFirst((product) => /hamper/.test(searchable(product)));
  takeFirst((product) => /candle|diya/.test(searchable(product)));
  takeFirst((product) => /crochet|amigurumi|yarn/.test(searchable(product)));

  if (diwaliOccasionId) {
    for (const product of candidates) {
      if (picked.length >= limit) break;
      if (!seen.has(product.id) && product.occasionIds.includes(diwaliOccasionId)) {
        picked.push(product);
        seen.add(product.id);
      }
    }
  }

  for (const product of candidates) {
    if (picked.length >= limit) break;
    if (!seen.has(product.id)) {
      picked.push(product);
      seen.add(product.id);
    }
  }

  return picked.slice(0, limit);
}
