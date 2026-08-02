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
 * Cancellation and returns — two windows, both enforced server-side, and
 * both easy to reopen by accident.
 *
 * **Cancellation closes at `packed`**: once a home cook has cooked and
 * boxed it, the cost of a cancellation lands on them rather than on a
 * warehouse. **Returns close 7 days after `deliveredAt`**, not after
 * `placedAt` — those can be a week apart on a made-to-order item, so
 * counting from the wrong one either closes the window before the food
 * arrives or leaves it open far too long.
 *
 * And the rule that carries the most money: **a return request moves no
 * money.** An admin resolves it. Auto-refunding would make the platform's
 * most abusable path also its most frictionless one, and the loss lands on
 * a home cook.
 */
describe('order cancellation and returns', () => {
  let h: Harness;
  let buyer: Actor;
  let productId: string;
  let addressId: string;

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    buyer = await createActor(h);
    const { vendor } = await createKitchen(h);
    const category = await createCategory(h);
    productId = (await createProduct(h, vendor.id, category.id)).id;
    addressId = (await createAddress(h, buyer.userId)).id;
  });

  const order = (
    status: 'pending_payment' | 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled',
    extra: { deliveredAt?: Date | null; placedAt?: Date } = {},
  ) =>
    createOrder(h, {
      userId: buyer.userId,
      addressId,
      items: [{ productId, name: 'Pickle', price: 250 }],
      status,
      ...extra,
    });

  const cancel = (actor: Actor, id: string, reason = 'Ordered by mistake') =>
    h.api().post(`${API_PREFIX}/orders/${id}/cancel`).set(auth(actor)).send({ reason });

  const requestReturn = (actor: Actor, id: string, reason = 'The jar arrived cracked') =>
    h.api().post(`${API_PREFIX}/orders/${id}/return`).set(auth(actor)).send({ reason });

  describe('cancellation window', () => {
    it.each(['pending_payment', 'placed'] as const)('allows cancelling from %s', async (status) => {
      const o = await order(status);
      await cancel(buyer, o.id).expect(201);
      const after = await h.prisma.order.findUnique({ where: { id: o.id } });
      expect(after!.status).toBe('cancelled');
      expect(after!.cancelledAt).toBeInstanceOf(Date);
    });

    it.each(['packed', 'shipped'] as const)('refuses to cancel once %s', async (status) => {
      // The line is drawn where the cost transfers to the home cook.
      const o = await order(status);
      const res = await cancel(buyer, o.id).expect(409);
      expect(errorOf(res).message).toMatch(/prepared/i);
      expect((await h.prisma.order.findUnique({ where: { id: o.id } }))!.status).toBe(status);
    });

    it('points a delivered order at returns instead of just refusing', async () => {
      // A dead end here is a support ticket. The error names the path
      // that does exist.
      const o = await order('delivered');
      const res = await cancel(buyer, o.id).expect(409);
      expect(errorOf(res).message).toMatch(/return/i);
    });

    it('treats a second cancellation as a no-op, not an error', async () => {
      // A double-tap on a slow connection is not a mistake worth an error
      // page.
      const o = await order('placed');
      await cancel(buyer, o.id).expect(201);
      await cancel(buyer, o.id).expect(201);
      expect(await h.prisma.order.count({ where: { status: 'cancelled' } })).toBe(1);
    });

    it("refuses to cancel someone else's order, as a 404 rather than a 403", async () => {
      // 403 would confirm the order id exists. Order ids are guessable
      // enough that the distinction is worth keeping.
      const stranger = await createActor(h);
      const o = await order('placed');
      await cancel(stranger, o.id).expect(404);
      expect((await h.prisma.order.findUnique({ where: { id: o.id } }))!.status).toBe('placed');
    });

    it('records the buyer\'s reason in their own words', async () => {
      const o = await order('placed');
      await cancel(buyer, o.id, 'Ordered the wrong size').expect(201);
      expect((await h.prisma.order.findUnique({ where: { id: o.id } }))!.refundReason).toBe(
        'Ordered the wrong size',
      );
    });
  });

  describe('return window', () => {
    it('accepts a return the day after delivery', async () => {
      const o = await order('delivered', { deliveredAt: daysAgo(1) });
      await requestReturn(buyer, o.id).expect(201);
      const after = await h.prisma.order.findUnique({ where: { id: o.id } });
      expect(after!.refundStatus).toBe('requested');
      expect(after!.refundRequestedAt).toBeInstanceOf(Date);
    });

    it('accepts one just inside seven days, and refuses one just outside', async () => {
      const inside = await order('delivered', { deliveredAt: daysAgo(6) });
      await requestReturn(buyer, inside.id).expect(201);

      const outside = await order('delivered', { deliveredAt: daysAgo(8) });
      const res = await requestReturn(buyer, outside.id).expect(409);
      expect(errorOf(res).message).toMatch(/close/i);
      expect((await h.prisma.order.findUnique({ where: { id: outside.id } }))!.refundStatus).toBe('none');
    });

    it('counts from delivery, not from when the order was placed', async () => {
      // The case that makes the distinction matter: a made-to-order item
      // placed a month ago and delivered yesterday is still returnable.
      const o = await order('delivered', { placedAt: daysAgo(30), deliveredAt: daysAgo(1) });
      await requestReturn(buyer, o.id).expect(201);
    });

    it('falls back to placedAt for a row delivered before deliveredAt existed', async () => {
      // Pre-M15 rows carry no `deliveredAt`. `placedAt` is the
      // conservative choice — an older window, never a longer one.
      const stale = await order('delivered', { placedAt: daysAgo(30), deliveredAt: null });
      await requestReturn(buyer, stale.id).expect(409);

      const recent = await order('delivered', { placedAt: daysAgo(2), deliveredAt: null });
      await requestReturn(buyer, recent.id).expect(201);
    });

    it.each(['placed', 'packed', 'shipped'] as const)(
      'refuses a return on an order that is only %s',
      async (status) => {
        const o = await order(status);
        const res = await requestReturn(buyer, o.id).expect(409);
        expect(errorOf(res).message).toMatch(/delivered/i);
      },
    );

    it('refuses a second return while one is already in progress', async () => {
      const o = await order('delivered', { deliveredAt: daysAgo(1) });
      await requestReturn(buyer, o.id).expect(201);
      await requestReturn(buyer, o.id).expect(409);
    });

    it("refuses a return on someone else's order", async () => {
      const stranger = await createActor(h);
      const o = await order('delivered', { deliveredAt: daysAgo(1) });
      await requestReturn(stranger, o.id).expect(404);
    });
  });

  describe('a return request moves no money', () => {
    it('records the claim and leaves the wallet untouched', async () => {
      // The whole point of the manual step. Auto-refunding would make the
      // most abusable path the most frictionless one, and the loss lands
      // on a home cook.
      const o = await order('delivered', { deliveredAt: daysAgo(1) });
      const before = await h.prisma.walletTransaction.count();

      await requestReturn(buyer, o.id).expect(201);

      expect(await h.prisma.walletTransaction.count()).toBe(before);
      const after = await h.prisma.order.findUnique({ where: { id: o.id } });
      expect(after!.refundStatus).toBe('requested');
      // Still delivered — a request is a claim, not a state change.
      expect(after!.status).toBe('delivered');
    });

    it('leaves the order for an admin to resolve rather than closing it', async () => {
      const o = await order('delivered', { deliveredAt: daysAgo(1) });
      await requestReturn(buyer, o.id, 'Tasted off').expect(201);
      const after = await h.prisma.order.findUnique({ where: { id: o.id } });
      expect(after!.refundStatus).not.toBe('refunded');
      expect(after!.refundReason).toBe('Tasted off');
    });
  });

  describe('deliveredAt is stamped wherever an order reaches delivered', () => {
    it('is set when a HomeKrafter advances the order', async () => {
      // A new transition path that forgets to stamp it would silently make
      // the return window count from `placedAt` instead.
      const kitchen = await createKitchen(h, { name: 'Advancing Kitchen' });
      const category = await createCategory(h);
      const theirProduct = await createProduct(h, kitchen.vendor.id, category.id);
      const seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });

      const o = await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId: theirProduct.id, name: 'Pickle', price: 250 }],
        status: 'shipped',
      });
      expect(o.deliveredAt).toBeNull();

      await h
        .api()
        .post(`${API_PREFIX}/seller/orders/${o.id}/advance`)
        .set(auth(seller))
        .send({ status: 'delivered' })
        .expect(201);

      const after = await h.prisma.order.findUnique({ where: { id: o.id } });
      expect(after!.status).toBe('delivered');
      expect(after!.deliveredAt).toBeInstanceOf(Date);
    });
  });
});
