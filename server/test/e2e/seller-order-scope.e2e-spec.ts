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
 * A HomeKrafter sees their own share of an order, and only that (M37).
 *
 * Before this, `GET /seller/orders*` returned the buyer-shaped `mapOrder`
 * whole: on a multi-vendor order every participating kitchen received the
 * other kitchens' line items, the buyer's `userId`, and the whole-order
 * money — and any participant could advance the *whole* order to
 * `delivered`, which stamps `deliveredAt` (the return-window clock) and is
 * the payout basis for every vendor's lines, not just their own.
 */
describe('seller order scope + multi-vendor advance guard', () => {
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

  /** Two kitchens sharing one order, plus a solo order for kitchen A. */
  async function twoKitchenOrder() {
    const a = await createKitchen(h);
    const b = await createKitchen(h);
    const actorA = await createActor(h, 'seller', { sellerId: a.seller.id });
    const actorB = await createActor(h, 'seller', { sellerId: b.seller.id });
    const category = await createCategory(h);
    const productA = await createProduct(h, a.vendor.id, category.id, { price: 200 });
    const productB = await createProduct(h, b.vendor.id, category.id, { price: 500 });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    const shared = await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [
        { productId: productA.id, name: productA.name, price: 200, quantity: 2 },
        { productId: productB.id, name: productB.name, price: 500 },
      ],
    });
    const solo = await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: productA.id, name: productA.name, price: 200 }],
    });

    return { actorA, actorB, buyer, shared, solo, productA, productB };
  }

  const advance = (actor: Actor, orderId: string) =>
    h.api().post(`${API_PREFIX}/seller/orders/${orderId}/advance`).set(auth(actor));

  it("projects a shared order down to the caller's own lines, money and nothing of the buyer", async () => {
    const { actorA, shared, productA, productB } = await twoKitchenOrder();

    const res = await h
      .api()
      .get(`${API_PREFIX}/seller/orders/${shared.id}`)
      .set(auth(actorA))
      .expect(200);

    // Own lines only — the other kitchen's ₹500 item is not in the body.
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].productId).toBe(productA.id);
    expect(JSON.stringify(res.body)).not.toContain(productB.id);

    // The caller's share, not the basket total (2 × ₹200, not ₹900).
    expect(res.body.itemsSubtotal).toBe(400);
    expect(res.body.multiVendor).toBe(true);

    // Nothing that describes the buyer or the whole order's money.
    expect(res.body).not.toHaveProperty('userId');
    expect(res.body).not.toHaveProperty('subtotal');
    expect(res.body).not.toHaveProperty('total');
    expect(res.body).not.toHaveProperty('walletApplied');
    expect(res.body).not.toHaveProperty('cashbackEarned');
    expect(res.body).not.toHaveProperty('refundStatus');
  });

  it('lists with the same projection, and never another kitchen’s solo orders', async () => {
    const { actorB, shared, solo } = await twoKitchenOrder();

    const res = await h.api().get(`${API_PREFIX}/seller/orders`).set(auth(actorB)).expect(200);

    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(shared.id);
    expect(ids).not.toContain(solo.id);
    for (const order of res.body) {
      expect(order).not.toHaveProperty('userId');
      expect(order).not.toHaveProperty('total');
    }
  });

  it('any participant advances own-prep stages; shipped/delivered on a shared order is refused naming the admin route', async () => {
    const { actorA, shared } = await twoKitchenOrder();

    // placed → confirmed → packed: the caller describing their own prep.
    await advance(actorA, shared.id).expect(201);
    await advance(actorA, shared.id).expect(201);

    // packed → shipped is a whole-order claim on a shared order.
    // (Error envelope is `{ error: { code, message } }` — the shape
    // `AllExceptionsFilter` promises in docs/API.md.)
    const refused = await advance(actorA, shared.id).expect(403);
    expect(refused.body.error.message).toContain("another HomeKrafter's items");

    const row = await h.prisma.order.findUniqueOrThrow({ where: { id: shared.id } });
    expect(row.status).toBe('packed');
    expect(row.deliveredAt).toBeNull();
  });

  it('a sole-vendor order still walks to delivered and stamps deliveredAt', async () => {
    const { actorA, solo } = await twoKitchenOrder();

    for (let i = 0; i < 4; i += 1) await advance(actorA, solo.id).expect(201);

    const row = await h.prisma.order.findUniqueOrThrow({ where: { id: solo.id } });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).not.toBeNull();
  });

  it('the admin override still moves a shared order — that is the route the refusal names', async () => {
    const { shared } = await twoKitchenOrder();
    const admin = await createActor(h, 'admin');

    await h
      .api()
      .patch(`${API_PREFIX}/admin/orders/marketplace/${shared.id}/status`)
      .set(auth(admin))
      .send({ status: 'delivered' })
      .expect(200);

    const row = await h.prisma.order.findUniqueOrThrow({ where: { id: shared.id } });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).not.toBeNull();
  });

  it('an order with none of the caller’s items 404s — never confirmed to exist', async () => {
    const { actorB, solo } = await twoKitchenOrder();
    await h.api().get(`${API_PREFIX}/seller/orders/${solo.id}`).set(auth(actorB)).expect(404);
    await advance(actorB, solo.id).expect(404);
  });
});
