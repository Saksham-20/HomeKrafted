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
 * What a HomeKrafter is owed.
 *
 * This number decides how much real money leaves a real bank account, and
 * **nothing asserted its arithmetic** — the payouts suite covers the
 * state machine around a payout, not the sum that sizes one. That gap
 * mattered when the computation moved from "load every delivered line
 * item, booking and snack order onto the heap and reduce" to SQL
 * aggregates, which is the kind of change that keeps returning a
 * plausible figure while being wrong.
 *
 * Every expected value below is arithmetic done by hand from a stated
 * seed. A figure copied out of a run would lock in whatever the code did
 * that day, which on this endpoint means locking in an underpayment.
 */
describe('seller earnings', () => {
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

  async function setup() {
    const kitchen = await createKitchen(h);
    const seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
    const category = await createCategory(h);
    const product = await createProduct(h, kitchen.vendor.id, category.id);
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    return { kitchen, seller, buyer, address, product };
  }

  const payouts = (actor: Actor) =>
    h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(actor)).expect(200);

  it('is zero, not NaN, for a kitchen that has delivered nothing', async () => {
    const { seller } = await setup();

    // `SUM` over no rows is SQL NULL. Coerced carelessly that is NaN, and
    // a NaN balance renders as "₹NaN" on the payouts screen.
    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(0);
  });

  it('multiplies by quantity — three jars is three jars', async () => {
    const { seller, buyer, address, product } = await setup();

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 250, quantity: 3 }],
      status: 'delivered',
    });

    // 250 × 3 = 750. A sum that dropped `quantity` would say 250 and pass
    // every single-item test ever written.
    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(750);
  });

  it('adds up several line items across several delivered orders', async () => {
    const { seller, buyer, address, product } = await setup();

    // 100×2 = 200, then 75×4 = 300, then 250×1 = 250. By hand: 750.
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [
        { productId: product.id, name: product.name, price: 100, quantity: 2 },
        { productId: product.id, name: product.name, price: 75, quantity: 4 },
      ],
      status: 'delivered',
    });
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 250, quantity: 1 }],
      status: 'delivered',
    });

    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(750);
  });

  it('counts only delivered orders', async () => {
    const { seller, buyer, address, product } = await setup();

    for (const status of ['placed', 'packed', 'shipped', 'cancelled'] as const) {
      await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [{ productId: product.id, name: product.name, price: 500 }],
        status,
      });
    }
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 40 }],
      status: 'delivered',
    });

    // Only the ₹40 one has actually been delivered. Paying out a
    // cancelled order is money that has to be clawed back from a home
    // cook.
    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(40);
  });

  it('counts only this kitchen’s own products', async () => {
    const { seller, buyer, address, product } = await setup();

    const otherKitchen = await createKitchen(h);
    const category = await createCategory(h);
    const otherProduct = await createProduct(h, otherKitchen.vendor.id, category.id);

    // One order containing both kitchens' goods — the normal case, since
    // a basket spans vendors.
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [
        { productId: product.id, name: product.name, price: 100 },
        { productId: otherProduct.id, name: otherProduct.name, price: 900 },
      ],
      status: 'delivered',
    });

    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(100);
  });

  it('subtracts what has already been requested or paid', async () => {
    const { kitchen, seller, buyer, address, product } = await setup();

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 1000 }],
      status: 'delivered',
    });
    await h.prisma.payout.create({
      data: {
        sellerId: kitchen.seller.id,
        amount: 400,
        status: 'paid',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });

    // 1000 earned, 400 already handed over: 600 still owed.
    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(600);
  });

  it('never goes negative', async () => {
    const { kitchen, seller, buyer, address, product } = await setup();

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 100 }],
      status: 'delivered',
    });
    await h.prisma.payout.create({
      data: {
        sellerId: kitchen.seller.id,
        amount: 5000,
        status: 'paid',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });

    // An overpayment is a conversation, not a negative "request payout"
    // button offering to take money back.
    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(0);
  });

  it('keeps paise — earnings are not rounded to whole rupees', async () => {
    const { seller, buyer, address, product } = await setup();

    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: 99.5, quantity: 3 }],
      status: 'delivered',
    });

    // 99.50 × 3 = 298.50 exactly.
    const res = await payouts(seller);
    expect(res.body.pendingBalance).toBe(298.5);
  });
});
