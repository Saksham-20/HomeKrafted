import { compareFeatured, isFeatured } from "@/lib/featured-order";
import type { Product } from "@/lib/types";

/**
 * How the home page's product shelves are ordered when nobody has curated
 * them (2026-09-19).
 *
 * The four "Bestsellers" / "Trending" rails read an admin-curated
 * collection when there is one. When the collection is missing or empty
 * they fall back to the catalogue itself, and so does the in-house
 * "By HomeKrafted" shelf. Both used to mean "highest rated"; both now
 * lead with the listings an admin **featured**, in the admin's order,
 * because "feature this" that does nothing on the home page is not a
 * feature. Pure and clock-free, so the Server Component and a test agree.
 */

/** Featured first (in the admin's order), then rating, then review count. */
export function compareTopRated(a: Product, b: Product): number {
  return (
    compareFeatured(a, b) ||
    b.rating - a.rating ||
    b.reviewCount - a.reviewCount
  );
}

/**
 * The uncurated rail: `products` are already this rail's kind, live and in
 * stock. Returns at most `limit`, featured first, then top-rated.
 *
 * **A featured listing is in the pool whether or not anybody has reviewed
 * it.** The reviewed-only pool exists so a rail called "most loved" is not
 * led by a tie of zeros (a listing somebody has reviewed is one somebody
 * loved); a listing an admin deliberately placed is the opposite of a tie
 * of zeros, and filtering it out would make featuring a new listing do
 * nothing here whenever any other listing has a review. With no reviews
 * anywhere the pool is everything, as before.
 */
export function uncuratedRail(products: readonly Product[], limit: number): Product[] {
  const anyReviewed = products.some((p) => p.reviewCount > 0);
  return products
    .filter((p) => isFeatured(p) || !anyReviewed || p.reviewCount > 0)
    .sort(compareTopRated)
    .slice(0, limit);
}
