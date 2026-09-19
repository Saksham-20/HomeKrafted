/**
 * Featured-first ordering (2026-09-19) — the buyer-side half of
 * "admin-chosen listings appear first".
 *
 * The server already answers `GET /products` in this order under the
 * default sort (`server/src/catalog/browse-order.ts`: `featured DESC,
 * featuredRank ASC NULLS LAST, rating DESC, ...`). But `/shop`, `/gifts`,
 * the home rails and the kitchens grid all re-sort the fetched page in
 * the browser, so each of them would have thrown that order away on the
 * first render. This is the one place that says what "featured first"
 * means, so the surfaces cannot each invent a version of it.
 *
 * **It is a leading key, not a sort.** `compareFeatured` returns 0 for a
 * tie and lets the caller's own tie-breakers (rating, occasion, arrival)
 * decide, and a caller applies it **only under the default sort**: an
 * explicit price or "nearest" sort is a question with a right answer, and
 * pinning featured listings to the top of "price, low to high" would be
 * the page ignoring what it was asked.
 *
 * Pure, clock-free and free of React and the DOM — the native app compiles
 * this exact file (`@shared/featured-order`), so it is under the
 * `client/lib` boundary contract.
 *
 * **`featuredRank` only counts while `featured` is true.** The server
 * compares the rank whatever `featured` says and relies on the invariant
 * "not featured means no rank" (`unfeature` clears it). Reading it only on
 * featured rows here gives the same order when the invariant holds and the
 * right one when it does not — a stale rank on an unfeatured row must not
 * lift it above a listing an admin actually chose.
 */
export interface FeaturedOrderable {
  featured?: boolean;
  /**
   * Lower is earlier. `null` = featured but unranked, which sorts after
   * every ranked listing. `undefined` = a server that predates the column,
   * read the same way.
   */
  featuredRank?: number | null;
}

/** `featured` is a real admin-set column; only a literal `true` counts. */
export function isFeatured(item: FeaturedOrderable): boolean {
  return item.featured === true;
}

/**
 * The rank as a number, or `null` for "unranked". A non-finite value is
 * treated as unranked rather than compared — `NaN - 3` is `NaN`, and a
 * comparator that returns `NaN` makes `Array.prototype.sort` order
 * undefined.
 */
function rankOf(item: FeaturedOrderable): number | null {
  const rank = item.featuredRank;
  return typeof rank === "number" && Number.isFinite(rank) ? rank : null;
}

/**
 * Featured before not-featured; among featured, rank ascending with
 * unranked last; **0 on every tie** so the caller's tie-breakers apply
 * (two featured listings an admin never ranked are ordered by whatever
 * the surface would have ordered them by, and two ordinary listings are
 * not touched at all).
 */
export function compareFeatured(a: FeaturedOrderable, b: FeaturedOrderable): number {
  const aFeatured = isFeatured(a);
  const bFeatured = isFeatured(b);
  if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
  if (!aFeatured) return 0;

  const aRank = rankOf(a);
  const bRank = rankOf(b);
  if (aRank === bRank) return 0;
  if (aRank === null) return 1;
  if (bRank === null) return -1;
  return aRank - bRank;
}

/**
 * Split a list into the featured half — in the admin's order — and
 * everything else, **in the order it arrived**.
 *
 * `/gifts` needs the halves separately: it round-robins makers across the
 * ordinary listings so no storefront owns the first screenful, and running
 * that over the featured ones as well would scramble the running order an
 * admin chose. Stable, so featured listings tied on rank keep the order
 * the caller had already given them.
 */
export function splitFeatured<T extends FeaturedOrderable>(
  list: readonly T[],
): { featured: T[]; rest: T[] } {
  const featured: T[] = [];
  const rest: T[] = [];
  for (const item of list) {
    if (isFeatured(item)) featured.push(item);
    else rest.push(item);
  }
  // A copy is already what `featured` is, so sorting it in place is safe.
  // `Array.prototype.sort` is stable, which is what keeps ties in the
  // caller's order.
  featured.sort(compareFeatured);
  return { featured, rest };
}

/**
 * A stable partition with the featured listings first, in rank order, then
 * everything else exactly as it was. Returns a new array.
 */
export function pinFeaturedFirst<T extends FeaturedOrderable>(list: readonly T[]): T[] {
  const { featured, rest } = splitFeatured(list);
  return [...featured, ...rest];
}

/**
 * The featured listing that sorts first, or `undefined` when none is
 * featured. On a tie the earliest in the list wins, so a caller that
 * passes its dishes best-first gets its own best featured dish back.
 * A kitchen is placed by this (`lib/kitchens.ts`).
 */
export function bestFeatured<T extends FeaturedOrderable>(list: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const item of list) {
    if (!isFeatured(item)) continue;
    if (best === undefined || compareFeatured(item, best) < 0) best = item;
  }
  return best;
}
