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
 * Seller analytics — one correctness decision carries the whole feature.
 *
 * **A seller's revenue is their line-item share, not the order total.** An
 * order spanning three kitchens must not credit each of them with all of
 * it. Getting this wrong overstates a home cook's earnings and puts the
 * dashboard permanently at odds with their payout, which is the single
 * worst way for a marketplace to lose a supplier's trust — and it is the
 * easy mistake, because scoping orders by "contains one of my products"
 * hands you the whole order object with a tempting `total` on it.
 *
 * The second rule: **ratios are `null`, not `0`, when there is nothing to
 * divide by.** "0% repeat customers" reads as a verdict on a kitchen that
 * simply hasn't had a second order yet.
 */
describe('seller analytics', () => {
  let h: Harness;
  let seller: Actor;
  let buyer: Actor;
  let addressId: string;
  let mine: { id: string };
  let theirs: { id: string };

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const category = await createCategory(h);

    const myKitchen = await createKitchen(h, { name: 'My Kitchen' });
    mine = await createProduct(h, myKitchen.vendor.id, category.id, { name: 'My pickle' });
    seller = await createActor(h, 'seller', { sellerId: myKitchen.seller.id });

    const otherKitchen = await createKitchen(h, { name: 'Other Kitchen' });
    theirs = await createProduct(h, otherKitchen.vendor.id, category.id, { name: 'Their laddoo' });

    buyer = await createActor(h);
    addressId = (await createAddress(h, buyer.userId)).id;
  });

  const analytics = (actor: Actor, days = 30) =>
    h.api().get(`${API_PREFIX}/seller/analytics?days=${days}`).set(auth(actor));

  describe('revenue attribution', () => {
    it('counts only the seller\'s own lines on a shared order', async () => {
      // The case the whole design turns on: one order, two kitchens.
      // ₹300 of mine, ₹700 of theirs, ₹1,000 total. My analytics must say
      // ₹300 — not ₹1,000, and not ₹500.
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        status: 'delivered',
        items: [
          { productId: mine.id, name: 'My pickle', price: 300 },
          { productId: theirs.id, name: 'Their laddoo', price: 700 },
        ],
      });

      const res = await analytics(seller).expect(200);
      expect(res.body.totals.revenue).toBe(300);
      expect(res.body.totals.orderCount).toBe(1);
      expect(res.body.totals.unitsSold).toBe(1);
    });

    it('multiplies by quantity rather than counting lines', async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        status: 'delivered',
        items: [{ productId: mine.id, name: 'My pickle', price: 250, quantity: 3 }],
      });
      const res = await analytics(seller).expect(200);
      expect(res.body.totals.revenue).toBe(750);
      expect(res.body.totals.unitsSold).toBe(3);
    });

    it('ignores an order containing none of the seller\'s products', async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        status: 'delivered',
        items: [{ productId: theirs.id, name: 'Their laddoo', price: 700 }],
      });
      const res = await analytics(seller).expect(200);
      expect(res.body.totals.revenue).toBe(0);
      expect(res.body.totals.orderCount).toBe(0);
    });

    it('ranks top items by the seller\'s own lines only', async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        status: 'delivered',
        items: [
          { productId: mine.id, name: 'My pickle', price: 100, quantity: 2 },
          { productId: theirs.id, name: 'Their laddoo', price: 900 },
        ],
      });
      const res = await analytics(seller).expect(200);
      expect(res.body.topItems).toHaveLength(1);
      expect(res.body.topItems[0].productId).toBe(mine.id);
      expect(res.body.topItems[0].revenue).toBe(200);
      expect(res.body.topItems[0].unitsSold).toBe(2);
    });
  });

  describe('empty windows say nothing rather than zero', () => {
    it('returns null ratios for a kitchen that has never sold anything', async () => {
      // A percentage change from an empty window is a division by zero
      // wearing a percent sign.
      const res = await analytics(seller).expect(200);
      expect(res.body.totals.revenue).toBe(0);
      expect(res.body.totals.revenueChangePct).toBeNull();
      expect(res.body.totals.orderCountChangePct).toBeNull();
      expect(res.body.totals.repeatRate).toBeNull();
      expect(res.body.totals.cancellationRate).toBeNull();
    });

    it('still returns a full series, so the chart renders flat rather than empty', async () => {
      const res = await analytics(seller, 7).expect(200);
      expect(res.body.series).toHaveLength(7);
      expect(res.body.series.every((p: { revenue: number }) => p.revenue === 0)).toBe(true);
      expect(res.body.byWeekday).toHaveLength(7);
    });

    it('echoes the window back so the client renders the range it asked for', async () => {
      const res = await analytics(seller, 90).expect(200);
      expect(res.body.days).toBe(90);
      expect(res.body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('scoping', () => {
    it('refuses a consumer and an anonymous caller', async () => {
      await h.api().get(`${API_PREFIX}/seller/analytics`).set(auth(buyer)).expect(403);
      await h.api().get(`${API_PREFIX}/seller/analytics`).expect(401);
    });

    it('never shows one kitchen another kitchen\'s numbers', async () => {
      // Same database, two sellers, one query. The scoping is the feature.
      const otherKitchen = await createKitchen(h, { name: 'Third Kitchen' });
      const category = await createCategory(h);
      const otherProduct = await createProduct(h, otherKitchen.vendor.id, category.id);
      const otherSeller = await createActor(h, 'seller', { sellerId: otherKitchen.seller.id });

      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        status: 'delivered',
        items: [{ productId: otherProduct.id, name: 'Theirs', price: 5000 }],
      });

      expect((await analytics(seller).expect(200)).body.totals.revenue).toBe(0);
      expect((await analytics(otherSeller).expect(200)).body.totals.revenue).toBe(5000);
    });
  });
});
