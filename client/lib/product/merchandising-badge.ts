import type { Product } from "@/lib/types";

/**
 * The badge on a product card, when there is something real to put in it.
 *
 * Only the tags an admin set (a seller can no longer — A1, 2026-09-19), and
 * `New` only while it is true. **There is no derived fallback, and most
 * cards carry no badge** — that is the point. The chain used to end in
 * three claims nobody made (2026-09-14):
 *
 * - `shippingScope === "local"` → **"Fresh Today"**. That column answers how
 *   far a listing may travel, not when it was cooked; it put "Fresh Today"
 *   on a jar of pickle that keeps for six months.
 * - `kind === "craft"` → **"Handcrafted"**, on a page of handcrafted goods.
 * - `kind === "food"` → **"Verified Kitchen"**, which is the one that
 *   mattered: `fssaiVerified` and `identityVerified` are real columns only
 *   an admin can set (M16), and this claimed the badge for every food
 *   listing on the site without reading either of them. A verification
 *   badge that is really `kind === "food"` is worth nothing, and it
 *   devalues the real one on the storefront.
 *
 * Between them they meant every card had a badge, which is decoration —
 * the same argument that keeps the pre-order badge off every listing.
 *
 * **"Featured" (2026-09-19) is the one last resort, and it is not one of
 * those.** `Product.featured` is a real column only an admin can set (the
 * moderation `feature` action, or the featured list), so the badge reports
 * something a person did — nothing here infers it from `kind` or
 * `shippingScope`. It is the lowest priority: a listing an admin also
 * tagged Bestseller, Festive, Curated or a fresh New wears the more
 * specific word, and a sold-out card wears nothing.
 *
 * `recentlyCreated` is passed in rather than computed: "how old is this
 * listing" reads the clock, and this module is shared with the native app
 * and kept free of it (the M12 rule).
 */
export function merchandisingBadge(
  product: Pick<Product, "tags" | "featured">,
  opts: { soldOut?: boolean; recentlyCreated: boolean },
): string | undefined {
  if (opts.soldOut) return undefined;
  if (product.tags?.includes("Bestseller")) return "Bestseller";
  if (product.tags?.includes("Festive")) return "Festive";
  if (product.tags?.includes("Curated")) return "Curated";
  if (product.tags?.includes("New") && opts.recentlyCreated) return "New";
  if (product.featured === true) return "Featured";
  return undefined;
}
