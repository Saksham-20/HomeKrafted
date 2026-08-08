import {
  API_PREFIX,
  Harness,
  createCategory,
  createHarness,
  createKitchen,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * `GET /products` has two code paths, and they must not disagree.
 *
 * The default browse — no search, no price range, no coordinates,
 * `most-loved` — is answered entirely in SQL, straight off an index.
 * Everything else falls through to a general path that reads the matching
 * set and filters, sorts and pages it in application code, because price
 * (the `defaultWeightSku` option's) and distance (haversine) are not
 * columns.
 *
 * That split exists for a measured reason. Against a 16-product seed a k6
 * ramp to 1000 VUs held p95 at 4.55 ms; against 2,017 products the same
 * ramp gave p95 2.06 s. A single request was still 40 ms — the cost was
 * reading two thousand rows to return twenty, multiplied by concurrency.
 * With the fast path and its index: 4 ms a request, p95 745 ms at 1000
 * VUs, and throughput doubled.
 *
 * **The risk a split like this introduces is divergence**, and it is
 * invisible: both paths return plausible pages, and only a boundary or an
 * ordering tie reveals that they disagree. These tests are the guard.
 */
describe('the product catalogue', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
  });

  /** `count` listings, deliberately with ties on rating and review count. */
  async function seedCatalogue(count: number) {
    const kitchen = await createKitchen(h);
    const category = await createCategory(h);
    for (let i = 0; i < count; i += 1) {
      const product = await createProduct(h, kitchen.vendor.id, category.id, {
        name: `Listing ${String(i).padStart(3, '0')}`,
        price: 100 + i,
      });
      // Three rating bands over `count` listings, so most rows tie with
      // several others — the case where an ordering without a unique final
      // key starts repeating one row and dropping another.
      await h.prisma.product.update({
        where: { id: product.id },
        data: { rating: [5, 4.5, 4][i % 3], reviewCount: i % 5 },
      });
    }
  }

  const browse = (query = '') =>
    h.api().get(`${API_PREFIX}/products${query}`).expect(200);

  it('returns a page and the real total', async () => {
    await seedCatalogue(30);

    const res = await browse('?pageSize=20');

    expect(res.body.items).toHaveLength(20);
    expect(res.body.total).toBe(30);
  });

  it('pages without repeating or dropping a listing', async () => {
    await seedCatalogue(30);

    const first = await browse('?pageSize=20');
    const second = await browse('?pageSize=20&page=2');

    const ids = [...first.body.items, ...second.body.items].map((p: { id: string }) => p.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  /**
   * The equivalence test, and the reason this file exists.
   *
   * `minPrice=0` filters nothing out, but it forces the general path —
   * so the same twenty listings, in the same order, must come back. If
   * the SQL `ORDER BY` and the JavaScript comparator ever drift apart,
   * this is where it shows.
   */
  it('orders a page identically whichever path serves it', async () => {
    await seedCatalogue(30);

    const fast = await browse('?pageSize=20');
    const slow = await browse('?pageSize=20&minPrice=0');

    expect(slow.body.items.map((p: { id: string }) => p.id)).toEqual(
      fast.body.items.map((p: { id: string }) => p.id),
    );
    expect(slow.body.total).toBe(fast.body.total);
  });

  it('agrees on page two as well, where a tie-break drift would surface', async () => {
    await seedCatalogue(30);

    const fast = await browse('?pageSize=20&page=2');
    const slow = await browse('?pageSize=20&page=2&minPrice=0');

    expect(slow.body.items.map((p: { id: string }) => p.id)).toEqual(
      fast.body.items.map((p: { id: string }) => p.id),
    );
  });

  it('still sorts by price when asked, which only the general path can do', async () => {
    await seedCatalogue(10);

    const res = await browse('?pageSize=10&sort=price-asc');

    const prices = res.body.items.map(
      (p: { weightOptions: { sku: string; price: number }[]; defaultWeightSku: string }) =>
        p.weightOptions.find((w) => w.sku === p.defaultWeightSku)?.price ?? 0,
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('never lists a pending listing on either path', async () => {
    const kitchen = await createKitchen(h);
    const category = await createCategory(h);
    await createProduct(h, kitchen.vendor.id, category.id, {
      name: 'Waiting for review',
      moderationStatus: 'pending',
    });

    // The fast path builds its `where` from the same `PUBLICLY_LISTED`
    // allowlist, but it is a second query — a gate that closes on one path
    // and not the other is not a gate.
    const fast = await browse('?pageSize=20');
    const slow = await browse('?pageSize=20&minPrice=0');

    expect(fast.body.total).toBe(0);
    expect(slow.body.total).toBe(0);
  });
});
