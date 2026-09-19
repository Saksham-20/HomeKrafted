import {
  BrowseOrderable,
  DEFAULT_BROWSE_ORDER,
  compareDefaultBrowse,
} from '../../src/catalog/browse-order';

/**
 * The default browse order has three homes — the SQL fast path, the
 * phase-one candidate read and this comparator — and the e2e spec pins
 * that they agree. This pins the comparator's own arithmetic, by hand.
 */
const row = (
  id: string,
  over: Partial<Omit<BrowseOrderable, 'id'>> = {},
): BrowseOrderable => ({
  id,
  featured: false,
  featuredRank: null,
  rating: 4,
  reviewCount: 10,
  ...over,
});

const order = (rows: BrowseOrderable[]) => [...rows].sort(compareDefaultBrowse).map((r) => r.id);

describe('compareDefaultBrowse', () => {
  it('puts every featured listing ahead of a better-rated unfeatured one', () => {
    expect(
      order([
        row('loved', { rating: 5, reviewCount: 500 }),
        row('featured', { featured: true, rating: 0, reviewCount: 0 }),
      ]),
    ).toEqual(['featured', 'loved']);
  });

  it('orders the featured by rank, lower first', () => {
    expect(
      order([
        row('c', { featured: true, featuredRank: 3 }),
        row('a', { featured: true, featuredRank: 1 }),
        row('b', { featured: true, featuredRank: 2 }),
      ]),
    ).toEqual(['a', 'b', 'c']);
  });

  it('sorts a featured-but-unranked listing after every ranked one, NULLS LAST', () => {
    expect(
      order([
        row('unranked', { featured: true, featuredRank: null, rating: 5 }),
        row('ranked-9', { featured: true, featuredRank: 9, rating: 1 }),
      ]),
    ).toEqual(['ranked-9', 'unranked']);
  });

  it('falls back to rating, then review count, among the unranked featured', () => {
    expect(
      order([
        row('low', { featured: true, rating: 4, reviewCount: 99 }),
        row('high-few', { featured: true, rating: 5, reviewCount: 1 }),
        row('high-many', { featured: true, rating: 5, reviewCount: 8 }),
      ]),
    ).toEqual(['high-many', 'high-few', 'low']);
  });

  it('leaves the ordinary ranking untouched for the unfeatured', () => {
    expect(
      order([
        row('b', { rating: 4.5, reviewCount: 3 }),
        row('a', { rating: 5, reviewCount: 1 }),
        row('c', { rating: 4.5, reviewCount: 9 }),
      ]),
    ).toEqual(['a', 'c', 'b']);
  });

  it('ends on the id, so a full tie is still a stable order', () => {
    expect(order([row('z'), row('m'), row('a')])).toEqual(['a', 'm', 'z']);
  });

  it('reads a Decimal-shaped rating the way the database would', () => {
    // Prisma hands `rating` back as a Decimal, whose valueOf is a string.
    const decimal = (n: number) => ({ valueOf: () => String(n), toString: () => String(n) });
    expect(
      order([row('low', { rating: decimal(4.5) }), row('high', { rating: decimal(4.75) })]),
    ).toEqual(['high', 'low']);
  });
});

describe('DEFAULT_BROWSE_ORDER', () => {
  it('leads with featured desc, then featuredRank asc nulls last, and ends on id', () => {
    // The index `Product_default_browse_featured_idx` is written to match
    // these keys exactly; changing one without the other puts the default
    // browse back on a sequential scan.
    expect(DEFAULT_BROWSE_ORDER).toEqual([
      { featured: 'desc' },
      { featuredRank: { sort: 'asc', nulls: 'last' } },
      { rating: 'desc' },
      { reviewCount: 'desc' },
      { id: 'asc' },
    ]);
  });
});
