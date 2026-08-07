import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createAddress,
  createCategory,
  createHarness,
  createKitchen,
  createOrder,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * The admin dashboard and analytics screens loaded **every** order,
 * booking and snack order on the platform — with nested `include`s — and
 * reduced over the arrays in JavaScript. They are now SQL aggregates.
 *
 * A rewrite from "sum it in the app" to "sum it in the database" is
 * exactly the kind that keeps returning a plausible number while being
 * wrong, so these assert the arithmetic against values computed by hand
 * from a known seed, never against a figure recorded from a run.
 *
 * One of them exists because the rewrite *was* wrong: the window boundary
 * was bound as a JS `Date`, the driver applied the connection's timezone
 * (`Asia/Kolkata` on the machine this was found on), and the oldest day in
 * the chart silently dropped every order placed before 05:30 UTC.
 */
describe('admin dashboard and analytics aggregates', () => {
  let h: Harness;
  let admin: Actor;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    admin = await createActor(h, 'admin');
  });

  async function seedShop() {
    const kitchen = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, kitchen.vendor.id, category.id);
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    return { product, buyer, address };
  }

  it('sums GMV and counts by module from the rows, not from a page of them', async () => {
    const { product, buyer, address } = await seedShop();

    // Three orders at 100, 250 and 40. By hand: 390.
    for (const price of [100, 250, 40]) {
      await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [{ productId: product.id, name: product.name, price }],
      });
    }

    const res = await h.api().get(`${API_PREFIX}/admin/dashboard`).set(auth(admin)).expect(200);

    expect(res.body.gmvTotal).toBe(390);
    expect(res.body.ordersTotalCount).toBe(3);
    expect(res.body.ordersByType).toEqual({ marketplace: 3, laundry: 0, snack: 0 });
  });

  it('counts today separately from all time', async () => {
    const { product, buyer, address } = await seedShop();

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 100 }],
      placedAt: new Date(),
    });
    // 40 days back: inside "all time", outside "today".
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 100 }],
      placedAt: new Date(Date.now() - 40 * 24 * 3_600_000),
    });

    const res = await h.api().get(`${API_PREFIX}/admin/dashboard`).set(auth(admin)).expect(200);

    expect(res.body.ordersTotalCount).toBe(2);
    expect(res.body.ordersTodayCount).toBe(1);
  });

  /**
   * The timezone regression, pinned.
   *
   * An order at 02:00 UTC on the oldest day of the window is inside it by
   * two hours. Under the bug, a connection at UTC+5:30 moved the boundary
   * to 05:30 and the order vanished from the chart — while every other day
   * stayed correct, which is why it survived a glance at the numbers.
   */
  it('includes an order in the small hours of the window’s oldest day', async () => {
    const { product, buyer, address } = await seedShop();

    const days = 14;
    const oldest = new Date();
    oldest.setUTCDate(oldest.getUTCDate() - (days - 1));
    oldest.setUTCHours(2, 0, 0, 0);

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 777 }],
      placedAt: oldest,
    });

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/analytics?days=${days}`)
      .set(auth(admin))
      .expect(200);

    const label = oldest.toISOString().slice(0, 10);
    const point = res.body.gmvSeries.find((p: { date: string }) => p.date === label);
    expect(point).toBeDefined();
    expect(point.gmv).toBe(777);
    expect(point.orderCount).toBe(1);
  });

  it('returns one point per day requested, zeros included', async () => {
    await seedShop();

    const res = await h.api().get(`${API_PREFIX}/admin/analytics?days=7`).set(auth(admin)).expect(200);

    // A day with no orders is a zero on the chart, not a missing column —
    // the series is driven by the date range, not by what the query
    // happened to return.
    expect(res.body.gmvSeries).toHaveLength(7);
    expect(res.body.gmvSeries.every((p: { gmv: number }) => p.gmv === 0)).toBe(true);
  });

  it('excludes an order older than the window', async () => {
    const { product, buyer, address } = await seedShop();

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 500 }],
      placedAt: new Date(Date.now() - 30 * 24 * 3_600_000),
    });

    const res = await h.api().get(`${API_PREFIX}/admin/analytics?days=7`).set(auth(admin)).expect(200);

    const windowGmv = res.body.gmvSeries.reduce((sum: number, p: { gmv: number }) => sum + p.gmv, 0);
    expect(windowGmv).toBe(0);
    // ...but the all-time dashboard still sees it.
    const dash = await h.api().get(`${API_PREFIX}/admin/dashboard`).set(auth(admin)).expect(200);
    expect(dash.body.gmvTotal).toBe(500);
  });
});
