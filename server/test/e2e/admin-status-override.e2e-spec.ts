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
  errorOf,
  resetDatabase,
} from './harness';

/**
 * `PATCH /admin/orders/:type/:id/status` — the manual status override.
 *
 * **Why this file exists.** The endpoint has been live and audited since
 * M8, but nothing in the UI reached it, and M27 was about to add a
 * control. Reviewing it first turned up four defects that were harmless
 * only for as long as no operator could click them:
 *
 * 1. Setting `cancelled` moves **no money**. The buyer-facing cancel path
 *    refunds the wallet, restocks the lines, reverses the cashback
 *    placement credited and stamps `cancelledAt`, all in one transaction.
 *    This wrote a status and messaged the customer — so they would be
 *    told their order was cancelled and never be refunded.
 * 2. Re-applying `delivered` re-stamped `deliveredAt`, silently restarting
 *    the seven-day return window (M15) on an order that had nearly run it.
 * 3. Re-selecting the current status notified the buyer again.
 * 4. Two admins with stale screens both wrote, last one silently winning.
 *
 * Each `it` below is one of those.
 */
describe('PATCH /admin/orders/:type/:id/status', () => {
  let h: Harness;
  let admin: Actor;
  let buyer: Actor;

  const override = (id: string, body: Record<string, unknown>) =>
    h.api().patch(`${API_PREFIX}/admin/orders/marketplace/${id}/status`).set(auth(admin)).send(body);

  async function placeOrder(overrides: Parameters<typeof createOrder>[1] extends never ? never : Partial<{ status: 'placed' | 'delivered'; deliveredAt: Date | null; cashbackEarned: number }> = {}) {
    const { vendor } = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id);
    const address = await createAddress(h, buyer.userId);
    return createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 250 }],
      ...overrides,
    });
  }

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    admin = await createActor(h, 'admin');
    buyer = await createActor(h, 'consumer');
  });

  describe('statuses that move money', () => {
    it('refuses to cancel, and names the path that actually refunds', async () => {
      const order = await placeOrder({ status: 'placed', cashbackEarned: 12 });

      const res = await override(order.id, { status: 'cancelled' }).expect(400);
      expect(errorOf(res).message).toMatch(/refunds the buyer/i);

      // The order is untouched: still placed, still no refund, and the
      // buyer has not been told anything.
      const after = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('placed');
      expect(after.cancelledAt).toBeNull();
      expect(await h.prisma.walletTransaction.count({ where: { wallet: { userId: buyer.userId } } })).toBe(0);
    });

    it('refuses to mark returned', async () => {
      const order = await placeOrder({ status: 'delivered' });
      const res = await override(order.id, { status: 'returned' }).expect(400);
      expect(errorOf(res).message).toMatch(/returns queue/i);
    });

    it('still allows the fulfilment statuses', async () => {
      const order = await placeOrder({ status: 'placed' });
      await override(order.id, { status: 'shipped' }).expect(200);
      const after = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('shipped');
    });
  });

  describe('the return window', () => {
    it('stamps deliveredAt the first time', async () => {
      const order = await placeOrder({ status: 'packed' as 'placed' });
      expect(order.deliveredAt).toBeNull();

      await override(order.id, { status: 'delivered' }).expect(200);

      const after = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.deliveredAt).not.toBeNull();
    });

    it('does not move deliveredAt when delivered is re-applied', async () => {
      // Six days into the seven-day return window. Re-stamping here would
      // quietly hand the buyer another week — or, read the other way,
      // move a window an operator may be counting on.
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
      const order = await placeOrder({ status: 'delivered', deliveredAt: sixDaysAgo });

      await override(order.id, { status: 'shipped' }).expect(200);
      await override(order.id, { status: 'delivered' }).expect(200);

      const after = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.deliveredAt?.toISOString()).toBe(sixDaysAgo.toISOString());
    });
  });

  describe('re-selecting the status already set', () => {
    it('is a no-op and writes no audit row', async () => {
      const order = await placeOrder({ status: 'placed' });

      await override(order.id, { status: 'placed' }).expect(200);

      // No audit row means no notification either — both hang off the
      // same "something changed" branch.
      expect(
        await h.prisma.adminAuditLog.count({ where: { action: 'order.status_override' } }),
      ).toBe(0);
    });
  });

  describe('two admins on one order', () => {
    it('409s the second writer instead of silently overwriting', async () => {
      const order = await placeOrder({ status: 'placed' });

      // First admin moves it on.
      await override(order.id, { status: 'packed', expectedStatus: 'placed' }).expect(200);

      // Second admin's screen still says "placed".
      const res = await override(order.id, { status: 'shipped', expectedStatus: 'placed' }).expect(409);
      expect(errorOf(res).message).toMatch(/changed while you were looking/i);

      const after = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('packed');
    });

    it('proceeds when the expected status still matches', async () => {
      const order = await placeOrder({ status: 'placed' });
      await override(order.id, { status: 'packed', expectedStatus: 'placed' }).expect(200);
      const after = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('packed');
    });

    it('rejects an expected status that is not a real one', async () => {
      const order = await placeOrder({ status: 'placed' });
      await override(order.id, { status: 'packed', expectedStatus: 'nonsense' }).expect(400);
    });
  });

  describe('the audit trail', () => {
    it('records what it changed from, not only what it changed to', async () => {
      const order = await placeOrder({ status: 'placed' });

      await override(order.id, { status: 'shipped' }).expect(200);

      const row = await h.prisma.adminAuditLog.findFirstOrThrow({
        where: { action: 'order.status_override', targetId: order.id },
      });
      expect(row.metadata).toMatchObject({ status: 'shipped', previousStatus: 'placed' });
      expect(row.actorId).toBe(admin.userId);
    });
  });

  describe('GET :type/:id/summary', () => {
    it('ships the pickable statuses so the client keeps no copy of the table', async () => {
      const order = await placeOrder({ status: 'placed' });

      const res = await h
        .api()
        .get(`${API_PREFIX}/admin/orders/marketplace/${order.id}/summary`)
        .set(auth(admin))
        .expect(200);

      expect(res.body.statusOptions).toEqual(
        expect.arrayContaining(['placed', 'packed', 'shipped', 'delivered']),
      );
      // The money-moving ones are absent here as well as refused above —
      // belt and braces, because the list is what the operator sees.
      expect(res.body.statusOptions).not.toContain('cancelled');
      expect(res.body.statusOptions).not.toContain('returned');
    });
  });
});
