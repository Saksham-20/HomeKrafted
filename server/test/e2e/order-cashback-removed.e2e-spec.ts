import { createHmac } from 'crypto';
import { PaymentsService } from '../../src/payments/payments.service';
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
 * Order cashback is off (2026-09-19, owner: "remove cashback from wallet").
 *
 * It used to be a flat 5% of the subtotal, credited to the wallet the moment
 * an order reached `placed`. It is now switched off by `CASHBACK_RATE = 0`,
 * not by deleting the credit: the credit and the reversal both read the
 * `Order.cashbackEarned` **snapshot**, so an order created before the switch —
 * or one sitting in `pending_payment` when it shipped — still holds a non-zero
 * figure that must be honoured on payment and unwound on cancellation.
 *
 * Two halves, and the second is the one that stops a well-meant clean-up
 * from costing somebody money:
 *   1. a NEW order snapshots 0 and writes no `cashback` ledger row on either
 *      payment path (wallet, and the verified-Razorpay settlement);
 *   2. a LEGACY order (`cashbackEarned > 0`) still credits on both paths.
 *      The reversal on cancel/refund is pinned in `orders-lifecycle`,
 *      `admin-status-override` and `unit/order-refund-cancel-race`.
 *
 * Ledger rows are asserted by `category`, not by title: a title is copy and
 * gets reworded, the category is what the admin dashboard's `byCategory` sums.
 */
describe('order cashback is removed', () => {
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

  /** A buyer with one ₹250 line in their basket and ₹5,000 in the wallet. */
  async function buyerWithFullCart() {
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    const { vendor } = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id, { price: 250 });
    const weight = await h.prisma.weightOption.findFirstOrThrow({
      where: { productId: product.id },
    });
    const cart = await h.prisma.cart.create({ data: { userId: buyer.userId } });
    await h.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        sku: weight.sku,
        quantity: 1,
        addressId: address.id,
      },
    });
    const wallet = await h.prisma.wallet.upsert({
      where: { userId: buyer.userId },
      create: { userId: buyer.userId, balance: 5000 },
      update: { balance: 5000 },
    });
    return { buyer, address, wallet };
  }

  const placeOrder = (buyer: Actor, addressId: string, paymentMethod: 'wallet' | 'razorpay') =>
    h
      .api()
      .post(`${API_PREFIX}/orders`)
      .set(auth(buyer))
      .send({ defaultAddressId: addressId, paymentMethod, shipments: [] })
      .expect(201);

  const cashbackRows = (walletId: string) =>
    h.prisma.walletTransaction.findMany({ where: { walletId, category: 'cashback' } });

  /** The captured-payment webhook, driven through the service (the harness app has no raw body). */
  async function captureViaWebhook(razorpayOrderId: string, paymentId: string) {
    const body = Buffer.from(
      JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId } } },
      }),
    );
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET as string)
      .update(body)
      .digest('hex');
    return h.app.get(PaymentsService).handleWebhook(body, signature);
  }

  describe('a new order', () => {
    it('shows no cashback estimate in the basket', async () => {
      const { buyer } = await buyerWithFullCart();
      const cart = await h.api().get(`${API_PREFIX}/cart`).set(auth(buyer)).expect(200);
      // The field stays in the response — an installed native build reads
      // it — and reads 0, which those builds already treat as "show nothing".
      expect(cart.body.subtotal).toBe(250);
      expect(cart.body.cashbackEstimate).toBe(0);
    });

    it('snapshots cashbackEarned = 0, and paying with the wallet writes no cashback row', async () => {
      const { buyer, address, wallet } = await buyerWithFullCart();
      const created = await placeOrder(buyer, address.id, 'wallet');
      expect(created.body.cashbackEarned).toBe(0);
      expect(
        Number((await h.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } })).cashbackEarned),
      ).toBe(0);

      await h.api().post(`${API_PREFIX}/orders/${created.body.id}/pay`).set(auth(buyer)).expect(201);

      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(order.status).toBe('placed');

      // Exactly the debit: opening 5000 − the order total. Not a rupee back.
      const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      expect(Number(after.balance)).toBe(5000 - Number(order.total));
      expect(Number(after.lifetimeSaved)).toBe(0);
      expect(await cashbackRows(wallet.id)).toHaveLength(0);

      const rows = await h.prisma.walletTransaction.findMany({ where: { walletId: wallet.id } });
      expect(rows.map((r) => r.category)).toEqual(['payment']);
    });

    it('cancelling it leaves one refund and no cashback reversal', async () => {
      // A reversal row here would mean a credit had been written that the
      // test above says was not — and it would be a debit for money the
      // buyer never received.
      const { buyer, address, wallet } = await buyerWithFullCart();
      const created = await placeOrder(buyer, address.id, 'wallet');
      await h.api().post(`${API_PREFIX}/orders/${created.body.id}/pay`).set(auth(buyer)).expect(201);

      await h
        .api()
        .post(`${API_PREFIX}/orders/${created.body.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Changed my mind' })
        .expect(201);

      const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      expect(Number(after.balance)).toBe(5000);
      expect(await cashbackRows(wallet.id)).toHaveLength(0);
      const categories = (
        await h.prisma.walletTransaction.findMany({ where: { walletId: wallet.id } })
      )
        .map((r) => r.category)
        .sort();
      expect(categories).toEqual(['payment', 'refund']);
    });

    it('snapshots 0 and writes no cashback row when the Razorpay webhook settles it', async () => {
      const { buyer, address, wallet } = await buyerWithFullCart();
      const created = await placeOrder(buyer, address.id, 'razorpay');
      expect(created.body.cashbackEarned).toBe(0);

      const rp = await h
        .api()
        .post(`${API_PREFIX}/payments/razorpay/order`)
        .set(auth(buyer))
        .send({ purpose: 'order', orderId: created.body.id })
        .expect(201);

      const outcome = await captureViaWebhook(rp.body.razorpayOrderId, 'pay_new_order_1');
      expect(outcome).toEqual({ received: true });

      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(order.status).toBe('placed');

      // A card payment never touches the wallet at all — no debit, no credit.
      const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      expect(Number(after.balance)).toBe(5000);
      expect(Number(after.lifetimeSaved)).toBe(0);
      expect(await h.prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(0);
    });
  });

  describe('a legacy order that was quoted cashback before it was removed', () => {
    /**
     * An order in `pending_payment` when this shipped already holds a
     * non-zero snapshot. It must still be credited when it is paid —
     * symmetric with the reversal that a later cancel would post — or the
     * credit branch is "cleaned up" and a buyer loses money they were
     * shown. Built with `createOrder`, which is how the pre-removal shape
     * is reproduced (a snapshot the server no longer writes).
     */
    async function legacyPendingOrder(paymentMethod: 'wallet' | 'razorpay') {
      const buyer = await createActor(h);
      const address = await createAddress(h, buyer.userId);
      const { vendor } = await createKitchen(h);
      const category = await createCategory(h);
      const product = await createProduct(h, vendor.id, category.id, { price: 750 });
      const order = await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [{ productId: product.id, name: product.name, price: 750 }],
        status: 'pending_payment',
        cashbackEarned: 12,
      });
      await h.prisma.order.update({ where: { id: order.id }, data: { paymentMethod } });
      const wallet = await h.prisma.wallet.upsert({
        where: { userId: buyer.userId },
        create: { userId: buyer.userId, balance: 5000 },
        update: { balance: 5000 },
      });
      return { buyer, order, wallet };
    }

    it('still credits it when paid from the wallet', async () => {
      const { buyer, order, wallet } = await legacyPendingOrder('wallet');

      await h.api().post(`${API_PREFIX}/orders/${order.id}/pay`).set(auth(buyer)).expect(201);

      const rows = await cashbackRows(wallet.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].direction).toBe('credit');
      expect(Number(rows[0].amount)).toBe(12);

      // 5000 − 750 paid + 12 cashback, and the running total moves with it.
      const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      expect(Number(after.balance)).toBe(4262);
      expect(Number(after.lifetimeSaved)).toBe(12);
    });

    it('still credits it when the Razorpay webhook settles it', async () => {
      const { buyer, order, wallet } = await legacyPendingOrder('razorpay');

      const rp = await h
        .api()
        .post(`${API_PREFIX}/payments/razorpay/order`)
        .set(auth(buyer))
        .send({ purpose: 'order', orderId: order.id })
        .expect(201);
      await captureViaWebhook(rp.body.razorpayOrderId, 'pay_legacy_order_1');

      expect((await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
        'placed',
      );
      const rows = await cashbackRows(wallet.id);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].amount)).toBe(12);

      // The card paid the order, so the wallet only gains the cashback.
      const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      expect(Number(after.balance)).toBe(5012);
      expect(Number(after.lifetimeSaved)).toBe(12);
    });

    it('is unwound to the rupee by a cancel, so credit and reversal stay symmetric', async () => {
      const { buyer, order, wallet } = await legacyPendingOrder('wallet');
      await h.api().post(`${API_PREFIX}/orders/${order.id}/pay`).set(auth(buyer)).expect(201);

      await h
        .api()
        .post(`${API_PREFIX}/orders/${order.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Changed my mind' })
        .expect(201);

      const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      expect(Number(after.balance)).toBe(5000);
      expect(Number(after.lifetimeSaved)).toBe(0);
      const rows = await cashbackRows(wallet.id);
      expect(rows.map((r) => r.direction).sort()).toEqual(['credit', 'debit']);
    });
  });
});
