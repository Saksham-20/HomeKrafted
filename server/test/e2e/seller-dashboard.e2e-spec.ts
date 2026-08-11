import {
  API_PREFIX,
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
 * `GET /seller/dashboard` — the numbers, against hand-built data.
 *
 * This existed only in `rbac.e2e-spec.ts`, which checks who may call it
 * and never what it says. M31 rewrote every query in it — two dependent
 * waves collapsed into one, whole-table `findMany`s that were summed in
 * JS replaced by aggregates, and a JS date comparison moved into SQL —
 * so the arithmetic needed a guard that was not "it returned 200".
 *
 * Every expected value below is computed by hand from the rows the test
 * creates. Recording what a run produced would lock in whatever the
 * rewrite got wrong, which is the one thing this file exists to catch.
 */
describe('GET /seller/dashboard', () => {
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

  it('counts today\'s orders and revenue for this vendor only', async () => {
    const { vendor, seller } = await createKitchen(h);
    const other = await createKitchen(h, { name: 'Someone Else' });
    const category = await createCategory(h);
    const actor = await createActor(h, 'seller', { sellerId: seller.id });

    const mine = await createProduct(h, vendor.id, category.id, { price: 300 });
    const theirs = await createProduct(h, other.vendor.id, category.id, { price: 900 });

    const buyer = await createActor(h, 'consumer');
    const address = await createAddress(h, buyer.userId);

    // Two orders today containing my product…
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: mine.id, name: 'Mine', price: 300 }],
    });
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: mine.id, name: 'Mine', price: 200 }],
    });
    // …one yesterday, which must not count…
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: mine.id, name: 'Mine', price: 999 }],
      placedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
    });
    // …and one today for another kitchen, which must not either.
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: theirs.id, name: 'Theirs', price: 900 }],
    });

    const res = await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(actor)).expect(200);

    expect(res.body.todayOrdersCount).toBe(2);
    expect(res.body.todayRevenue).toBe(500);
  });

  it('counts listings, live listings and low stock', async () => {
    const { vendor, seller } = await createKitchen(h);
    const category = await createCategory(h);
    const actor = await createActor(h, 'seller', { sellerId: seller.id });

    const a = await createProduct(h, vendor.id, category.id);
    const b = await createProduct(h, vendor.id, category.id);
    await createProduct(h, vendor.id, category.id);

    // One switched off by the HomeKrafter…
    await h.prisma.product.update({ where: { id: a.id }, data: { isAvailable: false } });
    // …and one running low, which is a weight-option fact, not a product one.
    await h.prisma.weightOption.updateMany({ where: { productId: b.id }, data: { stock: 3 } });

    const res = await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(actor)).expect(200);

    expect(res.body.listingsCount).toBe(3);
    expect(res.body.activeListingsCount).toBe(2);
    expect(res.body.lowStockCount).toBe(1);
  });

  it('answers with zeroes, not an error, for a kitchen with nothing yet', async () => {
    // The normal state of a HomeKrafter approved this morning — and the
    // case the old code special-cased with `productIdList.length ? … : []`.
    const { seller } = await createKitchen(h);
    const actor = await createActor(h, 'seller', { sellerId: seller.id });

    const res = await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(actor)).expect(200);

    expect(res.body).toMatchObject({
      todayOrdersCount: 0,
      todayRevenue: 0,
      listingsCount: 0,
      activeListingsCount: 0,
      lowStockCount: 0,
      todayPickupsCount: 0,
      todayDeliveriesCount: 0,
      weekEarnings: 0,
      incomingOrdersCount: 0,
      menuSize: 0,
      snackEarnings: 0,
      pendingPayoutAmount: 0,
    });
  });

  it('sums snack earnings from delivered orders and counts the waiting ones', async () => {
    const { seller } = await createKitchen(h);
    const actor = await createActor(h, 'seller', { sellerId: seller.id });

    await h.prisma.snack.create({
      data: {
        sellerId: seller.id,
        slug: `snack-${Date.now()}`,
        name: 'Samosa',
        description: 'Fried, folded, filled.',
        price: 40,
        category: 'savoury',
        diet: 'veg',
        imagePlaceholder: 'samosa',
        moderationStatus: 'active',
      },
    });

    const order = (status: 'received' | 'delivered', total: number) =>
      h.prisma.snackOrder.create({
        data: {
          sellerId: seller.id,
          customerName: 'A Buyer',
          customerPhone: '9000000000',
          total,
          status,
        },
      });

    await order('delivered', 120);
    await order('delivered', 80);
    await order('received', 60);

    const res = await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(actor)).expect(200);

    // Only delivered money is earned; the waiting one is a count, not revenue.
    expect(res.body.snackEarnings).toBe(200);
    expect(res.body.incomingOrdersCount).toBe(1);
    expect(res.body.menuSize).toBe(1);
  });

  it('counts pickups and deliveries falling on today, by UTC day', async () => {
    // Laundry is withdrawn (M19) but existing bookings still render, and
    // these two counters used to be a JS comparison on
    // `toISOString().slice(0, 10)` — a UTC day. The SQL replacement has
    // to agree with that, not with local midnight.
    const { seller } = await createKitchen(h);
    const actor = await createActor(h, 'seller', { sellerId: seller.id });
    const buyer = await createActor(h, 'consumer');
    const address = await createAddress(h, buyer.userId);

    const utcDay = new Date().toISOString().slice(0, 10);
    const atUtc = (day: string, time = '09:00:00.000Z') => new Date(`${day}T${time}`);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const slot = await h.prisma.laundrySlot.create({ data: { label: '09:00–11:00' } });

    let bookingSeq = 0;
    const booking = (pickup: Date, delivery: Date, total: number, cancelled = false) =>
      h.prisma.laundryBooking.create({
        data: {
          bookingNumber: `LB-${Date.now().toString(36)}-${(bookingSeq += 1)}`,
          userId: buyer.userId,
          partnerId: seller.id,
          addressId: address.id,
          pickupDate: pickup,
          pickupSlotId: slot.id,
          deliveryDate: delivery,
          deliverySlotId: slot.id,
          paymentMethod: 'wallet',
          estimatedTotal: total,
          status: cancelled ? 'cancelled' : 'scheduled',
        },
      });

    await booking(atUtc(utcDay), atUtc(tomorrow), 300);
    await booking(atUtc(utcDay, '23:30:00.000Z'), atUtc(tomorrow), 200);
    await booking(atUtc(tomorrow), atUtc(utcDay), 150);
    // Cancelled money is not earned, but the pickup still isn't today.
    await booking(atUtc(tomorrow), atUtc(tomorrow), 500, true);

    const res = await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(actor)).expect(200);

    expect(res.body.todayPickupsCount).toBe(2);
    expect(res.body.todayDeliveriesCount).toBe(1);
    // Three non-cancelled bookings created just now: 300 + 200 + 150.
    expect(res.body.weekEarnings).toBe(650);
  });

  it('reports the vendor rating and review count', async () => {
    const { vendor, seller } = await createKitchen(h);
    const actor = await createActor(h, 'seller', { sellerId: seller.id });

    await h.prisma.vendor.update({
      where: { id: vendor.id },
      data: { rating: 4.5, reviewCount: 12 },
    });

    const res = await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(actor)).expect(200);

    expect(res.body.rating).toBe(4.5);
    expect(res.body.reviewCount).toBe(12);
  });
});
