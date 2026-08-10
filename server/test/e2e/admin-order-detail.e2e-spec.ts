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
 * `/admin/orders/[type]/[id]` — the screen an operator opens to look at
 * one order, and the screen the refund button lives on.
 *
 * **The defect these exist for.** The screen's header needs the unified
 * *list row* (customer name, HomeKrafter names — neither of which is on
 * the `Order` table), and the client resolved it by fetching page one of
 * `GET /admin/orders` and searching it in the browser. The list is paged
 * at 25 per source, so an order with 25 newer siblings simply was not in
 * the response: the screen rendered "Order not found." for a record the
 * API returns without complaint, and — because the refund control is on
 * that screen — **an admin could not refund an order once the queue had
 * moved past it.**
 *
 * The same shape as `8698b4b`'s `/admin/catalog/[id]` bug (a detail page
 * resolving its record out of a *filtered* list) and it survived for the
 * same reason: it works perfectly for the newest orders, which are the
 * ones anybody tests with.
 *
 * `GET /admin/orders/:type/:id/summary` is the door that was missing. The
 * first test is the regression; the rest pin the properties the screen
 * depends on.
 */
describe('admin order detail', () => {
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

  /** `count` orders for one buyer, newest first, and the oldest one's id. */
  async function seedOrders(count: number) {
    const kitchen = await createKitchen(h, { name: "Anjali's Kitchen" });
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
          placedAt: new Date(Date.now() - i * 3_600_000),
        }),
      );
    }
    return { oldest: created[created.length - 1], buyer, kitchen };
  }

  it('resolves an order that is not on the first page of the list', async () => {
    // 30 orders against a page size of 25 — the oldest five are exactly
    // the ones the old client-side lookup could never find.
    const { oldest } = await seedOrders(30);

    const page1 = await h
      .api()
      .get(`${API_PREFIX}/admin/orders`)
      .set(auth(admin))
      .expect(200);
    expect(page1.body.items.map((o: { id: string }) => o.id)).not.toContain(
      `marketplace:${oldest.id}`,
    );

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/orders/marketplace/${oldest.id}/summary`)
      .set(auth(admin))
      .expect(200);

    expect(res.body.id).toBe(`marketplace:${oldest.id}`);
    expect(res.body.reference).toBe(oldest.orderNumber);
  });

  it('carries the names the detail header shows, which the order row itself does not', async () => {
    const { oldest, buyer } = await seedOrders(1);

    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/orders/marketplace/${oldest.id}/summary`)
      .set(auth(admin))
      .expect(200);

    expect(res.body.customerName).toBe('Test consumer');
    expect(res.body.customerUserId).toBe(buyer.userId);
    expect(res.body.sellerNames).toEqual(["Anjali's Kitchen"]);
    // The refund button is disabled without this — it is what identifies
    // the wallet to credit.
    expect(res.body.customerUserId).toBeTruthy();
  });

  it('404s for an id that does not exist, so the screen can tell them apart from a failure', async () => {
    await h
      .api()
      .get(`${API_PREFIX}/admin/orders/marketplace/no-such-order/summary`)
      .set(auth(admin))
      .expect(404);
  });

  it('400s on an unknown order type rather than guessing one', async () => {
    const { oldest } = await seedOrders(1);

    await h
      .api()
      .get(`${API_PREFIX}/admin/orders/hamper/${oldest.id}/summary`)
      .set(auth(admin))
      .expect(400);
  });

  it('is admin-only', async () => {
    const { oldest } = await seedOrders(1);
    const shopper = await createActor(h);

    await h
      .api()
      .get(`${API_PREFIX}/admin/orders/marketplace/${oldest.id}/summary`)
      .set(auth(shopper))
      .expect(403);
  });

  /**
   * The other half of the same screen. It used to refund by posting a raw
   * credit to `POST /admin/wallet/:userId/refund` with an operator-typed
   * amount and no `Idempotency-Key` — which never set `refundStatus`, so
   * the same order could be refunded again the next day, and a retry
   * after a timeout credited twice. Reproduced against the running API
   * during the sweep: three calls, three credits, ₹4,497 handed out on a
   * ₹1,499 order.
   */
  describe('refunding from that screen', () => {
    it('credits once, however many times the button is pressed', async () => {
      const { oldest, buyer } = await seedOrders(1);
      const before = await h.prisma.wallet.findUnique({ where: { userId: buyer.userId } });

      const key = 'admin-refund-test-key';
      for (let i = 0; i < 3; i += 1) {
        await h
          .api()
          .post(`${API_PREFIX}/admin/orders/marketplace/${oldest.id}/refund`)
          .set(auth(admin))
          .set('Idempotency-Key', key)
          .expect(201);
      }

      const after = await h.prisma.wallet.findUnique({ where: { userId: buyer.userId } });
      const credited = Number(after!.balance) - Number(before?.balance ?? 0);
      expect(credited).toBe(Number(oldest.total));

      const rows = await h.prisma.walletTransaction.findMany({
        where: { refType: 'order', refId: oldest.id, category: 'refund' },
      });
      expect(rows).toHaveLength(1);
    });

    it('refuses a second refund even under a fresh key, because the order is already refunded', async () => {
      const { oldest, buyer } = await seedOrders(1);

      await h
        .api()
        .post(`${API_PREFIX}/admin/orders/marketplace/${oldest.id}/refund`)
        .set(auth(admin))
        .set('Idempotency-Key', 'first')
        .expect(201);
      const afterFirst = await h.prisma.wallet.findUnique({ where: { userId: buyer.userId } });

      await h
        .api()
        .post(`${API_PREFIX}/admin/orders/marketplace/${oldest.id}/refund`)
        .set(auth(admin))
        .set('Idempotency-Key', 'second-and-different')
        .expect(201);
      const afterSecond = await h.prisma.wallet.findUnique({ where: { userId: buyer.userId } });

      expect(Number(afterSecond!.balance)).toBe(Number(afterFirst!.balance));

      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: oldest.id } });
      expect(order.refundStatus).toBe('refunded');
    });
  });
});
