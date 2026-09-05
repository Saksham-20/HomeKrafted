import type { DietType, Product } from "@/lib/types";

/**
 * Which diet mark a listing carries — and, just as importantly, when it
 * carries none.
 *
 * `undefined` is a real, common answer and every caller must handle it.
 * Two different listings produce it: a craft listing, which has no diet
 * at all, and a food listing whose maker has never been asked (every row
 * written before 2026-09-05, when `"non-vegetarian"` and `"contains-egg"`
 * were added to `DietaryTag`). Nothing here guesses between them.
 *
 * **The asymmetry is the whole design.** A vegetarian buyer relies on the
 * green mark, so printing it on an untagged dish is a claim that can be
 * wrong in a way that matters — somebody eats something they would not
 * have. Printing a red mark on an untagged dish is merely unhelpful, and
 * printing nothing is honest. So: veg only when the maker said veg or
 * vegan, non-veg only when the maker said non-vegetarian, and nothing at
 * all otherwise. Never `!dietary.includes("vegetarian") -> non-veg`,
 * which is the shortcut this function exists to stop.
 *
 * An egg listing is not a third mark. FSSAI's own scheme has two, and
 * whether egg counts as vegetarian is a question people answer
 * differently — so `"contains-egg"` rides as a separate dietary tag a
 * buyer can filter on, and the mark still reports what the maker said
 * about veg/non-veg.
 */
export function dietOf(product: Pick<Product, "dietary">): DietType | undefined {
  const dietary = product.dietary ?? [];
  /*
   * Non-veg is tested first, and the order is the safety rule rather
   * than style. The listing form makes the two chips exclusive, but a
   * payload can arrive from anywhere — a native client, an import, an
   * older build — carrying both. When the data contradicts itself the
   * only safe reading is the one that cannot mislead a vegetarian
   * buyer, so the red mark wins.
   */
  if (dietary.includes("non-vegetarian")) return "non-veg";
  if (dietary.includes("vegetarian") || dietary.includes("vegan")) return "veg";
  return undefined;
}

/** Whether the maker has answered the veg/non-veg question at all. */
export function hasDietMark(product: Pick<Product, "dietary">): boolean {
  return dietOf(product) !== undefined;
}
