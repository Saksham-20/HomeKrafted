import {
  API_PREFIX,
  Harness,
  auth,
  createActor,
  createAddress,
  createCategory,
  createHarness,
  createKitchen,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * Audit findings #41/#42 (2026-09-17): a `CartItem`/`OrderItem` carrying
 * a legacy `hamperId` has no `productId` of its own, and `POST
 * /cart/hamper-items` is still a live route (M18 kept it only so pre-M18
 * orders still render, but never removed it). Every seller-facing read
 * that resolved "whose product is this" by reading `item.product.vendorId`
 * alone therefore treated a hamper-only order as nobody's — invisible in
 * the fulfilment queue, and its earnings permanently excluded from the
 * payout sum even once delivered.
 *
 * `itemVendorId` (`seller/mappers/seller-order.mapper.ts`) is the one
 * place that now resolves a line's maker either way; these specs exercise
 * it end to end rather than as a pure-function unit, since the bug was
 * entirely about wiring, not arithmetic.
 */
describe('hamper orders reach their maker', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h);
  });

  async function placedHamperOrder() {
    const { vendor, seller } = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id, { price: 400 });
    const actor = await createActor(h, 'seller', { sellerId: seller.id });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);

    // No admin route creates a `HamperBox` any more (M18) — seeded
    // directly, the same way the legacy row would already exist in
    // production.
    const box = await h.prisma.hamperBox.create({
      data: { name: 'Classic Box', maxItems: 5, price: 150, itemsLabel: 'items' },
    });
    const hamper = await h.prisma.hamper.create({
      data: { userId: buyer.userId, boxId: box.id },
    });
    await h.prisma.hamperItem.create({
      data: { hamperId: hamper.id, productId: product.id, quantity: 1 },
    });
    const cart = await h.prisma.cart.create({ data: { userId: buyer.userId } });
    await h.prisma.cartItem.create({
      data: { cartId: cart.id, hamperId: hamper.id, quantity: 1, addressId: address.id },
    });

    await h.prisma.wallet.upsert({
      where: { userId: buyer.userId },
      create: { userId: buyer.userId, balance: 10_000 },
      update: { balance: 10_000 },
    });

    const res = await h
      .api()
      .post(`${API_PREFIX}/orders`)
      .set(auth(buyer))
      .send({ defaultAddressId: address.id, paymentMethod: 'wallet', shipments: [] })
      .expect(201);

    // Commission is off by default in this harness (matches production's
    // default), so the hamper's base — box + its one product line — is
    // exactly what the buyer paid and exactly what the maker is owed.
    return { seller, actor, orderId: res.body.id as string, hamperBase: 150 + 400 };
  }

  it('lists and opens an order made entirely of a hamper line', async () => {
    const { actor, orderId } = await placedHamperOrder();

    const list = await h.api().get(`${API_PREFIX}/seller/orders`).set(auth(actor)).expect(200);
    expect(list.body.items.map((o: { id: string }) => o.id)).toContain(orderId);

    const one = await h.api().get(`${API_PREFIX}/seller/orders/${orderId}`).set(auth(actor)).expect(200);
    expect(one.body.id).toBe(orderId);
    expect(one.body.items).toHaveLength(1);
    expect(one.body.multiVendor).toBe(false);
  });

  it('counts a delivered hamper order toward the maker\'s pending payout', async () => {
    const { actor, orderId, hamperBase } = await placedHamperOrder();

    await h.prisma.order.update({
      where: { id: orderId },
      data: { status: 'delivered', deliveredAt: new Date() },
    });

    const res = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(actor)).expect(200);
    expect(res.body.pendingBalance).toBe(hamperBase);
    expect(res.body.commission.grossPending).toBe(hamperBase);
  });
});
