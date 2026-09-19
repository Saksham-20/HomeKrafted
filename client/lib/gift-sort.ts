import { DEFAULT_BROWSE_SORT, type BrowseSortKey } from "@/lib/browse-params";
import { purchasableSku } from "@/lib/cart/purchasable-sku";
import { compareFeatured, splitFeatured } from "@/lib/featured-order";
import type { Product } from "@/lib/types";

/**
 * How `/gifts` orders its grid (2026-09-16, docs/GIFTING-REWORK.md D9).
 *
 * Pure and clock-free: which occasions are "coming up" is decided once by
 * the Server Component and handed in as ids, so the server render and the
 * browser agree on the order (the M12 React #418 rule).
 *
 * Two things were wrong with the old default ("Most loved": rating, then
 * review count). No gift had a review, so it sorted on nothing and the
 * API's creation order came through. And nothing looked at stock, so the
 * first row on a 1440px screen was six **Sold out** Rakhi hampers for a
 * festival already past.
 */

export interface GiftSortContext {
  /** Ids of dated occasions happening soon — see the gifts page. */
  soonOccasionIds: ReadonlySet<string>;
  priceOf: (product: Product) => number;
}

/** No size of it can be added to a basket. Same test the card's button uses. */
export function isSoldOut(product: Pick<Product, "weightOptions" | "defaultWeightSku">): boolean {
  return purchasableSku(product) === null;
}

/**
 * When a listing arrived, as a sortable number. The public payload carries
 * `submittedAt`/`moderatedAt` rather than `createdAt`; absent sorts as
 * oldest. A timestamp comparison, never a read of the clock.
 */
function arrivedAt(product: Product): number {
  const raw = product.createdAt ?? product.submittedAt ?? product.moderatedAt;
  const time = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(time) ? 0 : time;
}

/**
 * "Recommended", the default: **listings an admin featured first, in the
 * order the admin chose** (2026-09-19, the same leading keys the API's
 * default sort carries), then a gift for an occasion coming up, then
 * reviewed listings by rating, then **newest first**. The API breaks ties by
 * id, which is creation order, so without the last step a catalogue with no
 * reviews always led with its oldest listings. The sold-out split happens
 * outside this, for every sort.
 *
 * Featured leads the occasion key on purpose: an admin placing a listing is
 * a deliberate choice, and "coming up soon" is an inference the page makes.
 * Two featured listings the admin never ranked tie on `compareFeatured` and
 * fall straight through to the occasion and rating keys below.
 */
export function compareRecommended(a: Product, b: Product, soon: ReadonlySet<string>): number {
  const featuredOrder = compareFeatured(a, b);
  if (featuredOrder !== 0) return featuredOrder;
  const aSoon = a.occasionIds.some((id) => soon.has(id)) ? 1 : 0;
  const bSoon = b.occasionIds.some((id) => soon.has(id)) ? 1 : 0;
  if (aSoon !== bSoon) return bSoon - aSoon;
  if (b.rating !== a.rating) return b.rating - a.rating;
  if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
  return arrivedAt(b) - arrivedAt(a);
}


/**
 * Spread the makers so the top of the grid is not one storefront
 * (owner, 2026-09-16: "i dont want that all first 10 products should be
 * of same krafter").
 *
 * A round-robin, not a shuffle. The catalogue is ordered by
 * `compareRecommended` first, and this takes one listing from each maker
 * in turn — best listing of maker A, best of maker B, and so on, then
 * round again. So the ranking still decides *which* of a maker's gifts
 * leads, and the only thing that changes is that no storefront can own
 * the first screenful.
 *
 * **Deterministic, with no clock and no `Math.random`.** A shuffle would
 * have been the literal reading of "randomise", and it is the wrong tool
 * three times over: the server render and the browser would disagree
 * (React #418, the M12 lesson), a listing could appear on page 1 and
 * again on page 2, and a link somebody shared would show a different
 * page to whoever opened it. Round-robin buys the same variety and keeps
 * every one of those properties.
 *
 * It preserves the input as a multiset — every listing appears exactly
 * once — which is what makes it safe to run under pagination.
 */
export function spreadByMaker(products: readonly Product[]): Product[] {
  if (products.length < 2) return [...products];

  // Insertion order is the ranked order, so the first maker seen is the
  // one with the best listing, and the round-robin starts with them.
  const byMaker = new Map<string, Product[]>();
  for (const product of products) {
    const queue = byMaker.get(product.vendorId);
    if (queue) queue.push(product);
    else byMaker.set(product.vendorId, [product]);
  }

  // One maker (or one listing each) — nothing to spread, and the ranked
  // order is already right.
  if (byMaker.size < 2) return [...products];

  const queues = [...byMaker.values()];
  const spread: Product[] = [];
  let placed = 0;
  while (placed < products.length) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        spread.push(next);
        placed += 1;
      }
    }
  }
  return spread;
}

/**
 * Sorts a copy. **Sold out always goes last**, whatever the sort: a
 * price-ascending list still leads with something a buyer can put in a
 * basket. Within each half the requested order applies, and ties keep the
 * API's order (`Array.prototype.sort` is stable).
 */
export function sortGifts(products: readonly Product[], sort: BrowseSortKey, ctx: GiftSortContext): Product[] {
  const order = (a: Product, b: Product): number => {
    if (sort === "price-asc") return ctx.priceOf(a) - ctx.priceOf(b);
    if (sort === "price-desc") return ctx.priceOf(b) - ctx.priceOf(a);
    // Absent distance sorts last — "we weren't told where you are" (M51).
    if (sort === "nearest") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    return compareRecommended(a, b, ctx.soonOccasionIds);
  };
  const inStock = products.filter((p) => !isSoldOut(p)).sort(order);
  const soldOut = products.filter((p) => isSoldOut(p)).sort(order);

  /*
    Makers are spread only under "Recommended". An explicit sort is a
    question with a right answer — price ascending has to actually
    ascend — and re-ordering it to vary the storefronts would be the page
    ignoring what it was asked. Sold-out listings keep their ranked order
    too; nobody is scrolling that far for variety.

    **Featured listings are pinned before the spread, not spread with the
    rest.** `spreadByMaker` is a round-robin over makers: handed a list
    that already leads with the featured ones it would deal them out one
    per maker among everything else, and an admin's running order — "this
    one first, then that one" — would land scattered down the page. So the
    featured half keeps the order `compareFeatured` gave it, and only the
    ordinary listings are spread. Featured sold-out listings are still in
    the sold-out half: an admin cannot feature something to the top of a
    grid it cannot be bought from.
  */
  if (sort !== DEFAULT_BROWSE_SORT) return [...inStock, ...soldOut];
  const { featured, rest } = splitFeatured(inStock);
  return [...featured, ...spreadByMaker(rest), ...soldOut];
}
