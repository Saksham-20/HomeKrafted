import type { Prisma } from '@prisma/client';

/**
 * The default browse order, written once (2026-09-19).
 *
 * `featured DESC, featuredRank ASC NULLS LAST, rating DESC, reviewCount
 * DESC, id ASC` — an admin's chosen listings first, in the order the admin
 * chose, then the ordinary "most loved" ranking, with a unique final key.
 *
 * **Three places must agree about this order**, and
 * `test/e2e/products-browse.e2e-spec.ts` pins that they do: the SQL fast
 * path (`orderBy`), the phase-one candidate read (`orderBy`, which decides
 * *which* 500 rows survive the cap), and the in-memory comparator that
 * sorts what phase one returned. Three hand-typed copies is how a page
 * boundary comes to shift depending on which path served the request, so
 * the two `orderBy` arrays are this one constant and the comparator is
 * this one function.
 *
 * The leading keys are also why `Product_default_browse_featured_idx`
 * exists: an index whose scan is by rating cannot serve an order that
 * leads with `featured`, and losing it puts the default browse back on the
 * sequential scan the M23 note in `schema.prisma` measured at p95 2.06 s.
 * Change the key list and that index in the same commit.
 *
 * `featuredRank` is compared whatever `featured` says, because that is
 * what the SQL does. It stays correct because every writer keeps the
 * invariant "not featured means no rank" (`unfeature`, and the
 * `PUT /admin/catalog/featured` list), so a stale rank on an unfeatured
 * row is not a state the application can produce.
 */
export const DEFAULT_BROWSE_ORDER: Prisma.ProductOrderByWithRelationInput[] = [
  { featured: 'desc' },
  // `nulls: 'last'` is Postgres's default for ASC, spelled out because
  // Prisma leaves it to the database and a reader should not have to know.
  { featuredRank: { sort: 'asc', nulls: 'last' } },
  { rating: 'desc' },
  { reviewCount: 'desc' },
  { id: 'asc' },
];

/** The four columns the comparator reads. `rating` is a Decimal on the row. */
export interface BrowseOrderable {
  id: string;
  featured: boolean;
  featuredRank: number | null;
  rating: unknown;
  reviewCount: number;
}

/**
 * `DEFAULT_BROWSE_ORDER` as a `Array.prototype.sort` comparator — same
 * keys, same directions, same NULLS LAST, same unique final key.
 */
export function compareDefaultBrowse(a: BrowseOrderable, b: BrowseOrderable): number {
  // Boolean DESC: true first.
  if (a.featured !== b.featured) return a.featured ? -1 : 1;

  // ASC with NULLS LAST: a ranked listing precedes an unranked one, and
  // two unranked ones tie here and fall through to rating.
  if (a.featuredRank !== b.featuredRank) {
    if (a.featuredRank === null) return 1;
    if (b.featuredRank === null) return -1;
    return a.featuredRank - b.featuredRank;
  }

  const ratingDelta = Number(b.rating) - Number(a.rating);
  if (ratingDelta !== 0) return ratingDelta;
  const reviewDelta = b.reviewCount - a.reviewCount;
  if (reviewDelta !== 0) return reviewDelta;

  // Every key above can tie, and until a unique last one the order within
  // a tie was whatever `findMany` returned — which Postgres does not
  // promise to be the same twice. Paging through a catalogue where a
  // hundred new listings all sit at rating 0, reviewCount 0 could show a
  // product on page 2 and again on page 3, and skip another entirely.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
