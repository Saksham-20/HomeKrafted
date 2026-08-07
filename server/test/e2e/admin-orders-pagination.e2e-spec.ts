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
 * `GET /admin/orders` read three whole tables — every marketplace order,
 * every laundry booking, every snack order, each with its relations — on
 * every visit to `/admin/orders`, and the screen then filtered and
 * searched the result in the browser.
 *
 * Making that a page is only half the fix. The half that is easy to get
 * wrong is search: a page plus a client-side filter means "search the
 * rows you happen to be looking at", so an admin looking up a real order
 * reference gets told it does not exist. These tests are mostly about
 * that.
 */
describe('admin unified order list', () => {
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

  /** `count` marketplace orders for one buyer, oldest first so `placedAt` ordering is checkable. */
  async function seedOrders(count: number) {
    const kitchen = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, kitchen.vendor.id, category.id, {
      name: 'Mango Thokku Pickle',
    });
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);

    const created = [];
    for (let i = 0; i < count; i += 1) {
      created.push(
        await createOrder(h, {
          userId: buyer.userId,
          addressId: address.id,
          items: [{ productId: product.id, name: product.name, price: 100 }],
          // One per hour, so newest-first has a single unambiguous answer.
          placedAt: new Date(Date.now() - i * 3_600_000),
        }),
      );
    }
    return { created, buyer, kitchen };
  }

  it('returns a page, not the whole platform, and reports the real total', async () => {
    await seedOrders(30);

    const res = await h.api().get(`${API_PREFIX}/admin/orders`).set(auth(admin)).expect(200);

    // Default page size is 25; 30 orders exist.
    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
    expect(res.body.page).toBe(1);
  });

  it('pages through without repeating or dropping an order', async () => {
    const { created } = await seedOrders(30);

    const first = await h.api().get(`${API_PREFIX}/admin/orders`).set(auth(admin)).expect(200);
    const second = await h.api().get(`${API_PREFIX}/admin/orders?page=2`).set(auth(admin)).expect(200);

    const ids = [...first.body.items, ...second.body.items].map((row: { id: string }) => row.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    expect(new Set(ids)).toEqual(new Set(created.map((o) => `marketplace:${o.id}`)));
  });

  it('newest first, across the page boundary', async () => {
    await seedOrders(30);

    const first = await h.api().get(`${API_PREFIX}/admin/orders`).set(auth(admin)).expect(200);
    const second = await h.api().get(`${API_PREFIX}/admin/orders?page=2`).set(auth(admin)).expect(200);

    const times = [...first.body.items, ...second.body.items].map((row: { placedAt: string }) =>
      new Date(row.placedAt).getTime(),
    );
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  /**
   * The reason search had to move server-side. This order is 30th of 30,
   * so it is on page 2 — a client-side filter over page 1 would find
   * nothing and report "no orders match".
   */
  it('finds an order that is not on the first page, by reference', async () => {
    const { created } = await seedOrders(30);
    const buried = created[created.length - 1];

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/orders?q=${encodeURIComponent(buried.orderNumber)}`)
      .set(auth(admin))
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].reference).toBe(buried.orderNumber);
  });

  it('searches the customer name case-insensitively', async () => {
    const { buyer } = await seedOrders(3);
    const user = await h.prisma.user.findUniqueOrThrow({ where: { id: buyer.userId } });

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/orders?q=${encodeURIComponent(user.name.toUpperCase())}`)
      .set(auth(admin))
      .expect(200);

    expect(res.body.total).toBe(3);
  });

  it('searches the HomeKrafter name', async () => {
    const { kitchen } = await seedOrders(3);
    const vendor = kitchen.vendor;

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/orders?q=${encodeURIComponent(vendor.name)}`)
      .set(auth(admin))
      .expect(200);

    expect(res.body.total).toBe(3);
  });

  it('counts only the filtered module, not everything', async () => {
    await seedOrders(3);

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/orders?type=snack`)
      .set(auth(admin))
      .expect(200);

    // No snack orders were seeded, so a total of 3 here would mean the
    // count ignored the filter the page obeyed — the failure that shows
    // as "Page 1 of 2" over a single empty page.
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it('rejects an unknown module rather than silently returning everything', async () => {
    await h.api().get(`${API_PREFIX}/admin/orders?type=nonsense`).set(auth(admin)).expect(400);
  });

  it('is still admin-only', async () => {
    const buyer = await createActor(h);
    await h.api().get(`${API_PREFIX}/admin/orders`).set(auth(buyer)).expect(403);
  });
});
