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
import { WhatsAppInboundService } from '../../src/whatsapp/whatsapp-inbound.service';

/**
 * Four money paths that were correct when walked once and wrong when
 * walked twice at the same time, found by the production audit
 * (2026-08-06).
 *
 * Every one is the same mistake: a read that establishes a fact, then a
 * write that assumes the fact still holds. Nothing between them stops a
 * second caller — a double-click, a second admin, a retried webhook —
 * from invalidating it. Under a single-user manual test they are
 * invisible, which is exactly why all four shipped.
 *
 * These specs exercise real concurrency (`Promise.allSettled` over
 * genuinely in-flight requests against one Postgres), not a simulated
 * interleaving. A test that stubs the timing proves only that the stub
 * was written to match the fix.
 */
describe('money paths under concurrency', () => {
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

  /** A HomeKrafter with exactly one delivered order behind them, so a payout is owed. */
  async function kitchenWithEarnings(price = 500) {
    const { vendor, seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id, { price });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price }],
      status: 'delivered',
    });

    return { seller, sellerActor, buyer, price };
  }

  describe('two people with the same first name can sign up at the same time', () => {
    it('registers both, with different referral codes', async () => {
      // `generateReferralCode` is deterministic on the first name, so
      // every "Priya" computes `PRIYA250`. The pre-check both callers ran
      // told both of them it was free, and the loser's insert died on a
      // unique violation — surfaced to a real person as a 500 on the
      // signup form. Not reachable by clicking the form yourself; certain
      // to fire under load.
      const results = await Promise.allSettled([
        h
          .api()
          .post(`${API_PREFIX}/auth/register`)
          .send({ name: 'Priya Sharma', email: 'priya.one@example.test', password: 'test-password-123' }),
        h
          .api()
          .post(`${API_PREFIX}/auth/register`)
          .send({ name: 'Priya Menon', email: 'priya.two@example.test', password: 'test-password-123' }),
      ]);

      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
      expect(statuses).toEqual([201, 201]);

      const codes = (
        await h.prisma.user.findMany({
          where: { email: { in: ['priya.one@example.test', 'priya.two@example.test'] } },
          select: { referralCode: true },
        })
      ).map((u) => u.referralCode);
      expect(codes).toHaveLength(2);
      expect(new Set(codes).size).toBe(2);
    });

    it('still reports a duplicate email as a conflict, not a referral-code problem', async () => {
      // The retry loop must stay narrowed to `referralCode`. Retrying a
      // duplicate *email* would spin ten times and then report the wrong
      // thing entirely.
      const body = { name: 'Priya Sharma', email: 'priya.dup@example.test', password: 'test-password-123' };
      await h.api().post(`${API_PREFIX}/auth/register`).send(body).expect(201);
      const second = await h.api().post(`${API_PREFIX}/auth/register`).send(body).expect(409);
      expect(second.body.error.message).toMatch(/email already exists/i);
    });
  });

  describe('a HomeKrafter cannot request the same earnings twice', () => {
    it('creates exactly one Payout when two requests race', async () => {
      const { seller, sellerActor, price } = await kitchenWithEarnings();

      // No `Idempotency-Key` on either — that header de-duplicates a
      // *repeat of one request*, and the browser sends a fresh key (or
      // none) per click. The race this reproduces is two distinct
      // requests, which is what a double-click actually produces.
      const results = await Promise.allSettled([
        h.api().post(`${API_PREFIX}/seller/payouts/request`).set(auth(sellerActor)),
        h.api().post(`${API_PREFIX}/seller/payouts/request`).set(auth(sellerActor)),
      ]);

      const statuses = results
        .map((r) => (r.status === 'fulfilled' ? r.value.status : 0))
        .sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const rows = await h.prisma.payout.findMany({ where: { sellerId: seller.id } });
      expect(rows).toHaveLength(1);
      // The whole balance, once — not twice, and not split.
      expect(Number(rows[0].amount)).toBe(price);
      expect(rows[0].status).toBe('pending');
    });

    it('still refuses a second request made after the first has settled in', async () => {
      // The sequential case, which always worked. Kept so a fix to the
      // race cannot regress the ordinary path into allowing a second row.
      const { seller, sellerActor } = await kitchenWithEarnings();

      await h.api().post(`${API_PREFIX}/seller/payouts/request`).set(auth(sellerActor)).expect(201);
      const second = await h
        .api()
        .post(`${API_PREFIX}/seller/payouts/request`)
        .set(auth(sellerActor))
        .expect(409);
      expect(second.body.error.message).toMatch(/already pending/i);

      expect(await h.prisma.payout.count({ where: { sellerId: seller.id } })).toBe(1);
    });

    it('lets a second payout through once the first is settled and new earnings exist', async () => {
      // The lock must not become a permanent block. A HomeKrafter paid in
      // January has to be able to request February.
      const { seller, sellerActor, buyer, price } = await kitchenWithEarnings();
      await h.api().post(`${API_PREFIX}/seller/payouts/request`).set(auth(sellerActor)).expect(201);
      await h.prisma.payout.updateMany({ where: { sellerId: seller.id }, data: { status: 'paid' } });

      const category = await h.prisma.category.findFirstOrThrow();
      const nextProduct = await createProduct(h, seller.vendorId, category.id, { price });
      const address = await h.prisma.address.findFirstOrThrow({ where: { userId: buyer.userId } });
      await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [{ productId: nextProduct.id, name: nextProduct.name, price }],
        status: 'delivered',
      });

      await h.api().post(`${API_PREFIX}/seller/payouts/request`).set(auth(sellerActor)).expect(201);
      expect(await h.prisma.payout.count({ where: { sellerId: seller.id } })).toBe(2);
    });
  });

  describe('two admins cannot both decide one payout', () => {
    async function pendingPayout(): Promise<{ payoutId: string; admins: [Actor, Actor] }> {
      const { seller, sellerActor } = await kitchenWithEarnings();
      const created = await h
        .api()
        .post(`${API_PREFIX}/seller/payouts/request`)
        .set(auth(sellerActor))
        .expect(201);
      expect(created.body.sellerId).toBe(seller.id);

      // In parallel on purpose. `createActor` names every actor
      // `Test admin`, and referral codes are derived from the first name —
      // so this is also the only place in the suite that registers two
      // colliding users at once, which is how the audit found that a
      // concurrent signup 500'd on a raw unique violation. Serializing
      // this call would hide that again.
      const admins = await Promise.all([createActor(h, 'admin'), createActor(h, 'admin')]);
      return { payoutId: created.body.id, admins: [admins[0], admins[1]] };
    }

    it('records one settlement when two admins pay it at once', async () => {
      const { payoutId, admins } = await pendingPayout();

      const results = await Promise.allSettled([
        h
          .api()
          .post(`${API_PREFIX}/admin/payouts/${payoutId}/pay`)
          .set(auth(admins[0]))
          .send({ reference: 'UTR-FIRST' }),
        h
          .api()
          .post(`${API_PREFIX}/admin/payouts/${payoutId}/pay`)
          .set(auth(admins[1]))
          .send({ reference: 'UTR-SECOND' }),
      ]);

      const statuses = results
        .map((r) => (r.status === 'fulfilled' ? r.value.status : 0))
        .sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      // The surviving row must carry the winner's reference intact.
      // `Payout.reference` is the only link to a transfer that happened
      // outside this system, so a lost write here loses the paper trail
      // for real money.
      const row = await h.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
      expect(row.status).toBe('paid');
      expect(['UTR-FIRST', 'UTR-SECOND']).toContain(row.reference);
      expect(row.decidedById).toBeTruthy();
    });

    it('does not let a rejection overwrite a settlement that raced it', async () => {
      // The worse direction: a payout recorded as paid under a real UTR,
      // then quietly rewritten to `rejected` by an admin who read the
      // queue a second earlier.
      const { payoutId, admins } = await pendingPayout();

      const results = await Promise.allSettled([
        h
          .api()
          .post(`${API_PREFIX}/admin/payouts/${payoutId}/pay`)
          .set(auth(admins[0]))
          .send({ reference: 'UTR-PAID' }),
        h
          .api()
          .post(`${API_PREFIX}/admin/payouts/${payoutId}/reject`)
          .set(auth(admins[1]))
          .send({ note: 'Looks wrong to me' }),
      ]);

      const statuses = results
        .map((r) => (r.status === 'fulfilled' ? r.value.status : 0))
        .sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const row = await h.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
      expect(['paid', 'rejected']).toContain(row.status);
      // Whichever won, the row is internally consistent — a `paid` row
      // must carry its reference, never the loser's note in place of it.
      if (row.status === 'paid') {
        expect(row.reference).toBe('UTR-PAID');
        expect(row.paidAt).toBeTruthy();
      } else {
        expect(row.note).toBe('Looks wrong to me');
        expect(row.paidAt).toBeNull();
      }
    });

    it('refuses a second decision sequentially, naming what it already became', async () => {
      const { payoutId, admins } = await pendingPayout();
      await h
        .api()
        .post(`${API_PREFIX}/admin/payouts/${payoutId}/pay`)
        .set(auth(admins[0]))
        .send({ reference: 'UTR-1' })
        .expect(201);

      const second = await h
        .api()
        .post(`${API_PREFIX}/admin/payouts/${payoutId}/reject`)
        .set(auth(admins[1]))
        .send({ note: 'too late' })
        .expect(409);
      expect(second.body.error.message).toMatch(/already been paid/i);
    });
  });

  describe('one order opens one payable Razorpay order', () => {
    async function orderAwaitingRazorpay(): Promise<{ buyer: Actor; orderId: string; total: number }> {
      const { vendor } = await createKitchen(h);
      const category = await createCategory(h);
      const product = await createProduct(h, vendor.id, category.id, { price: 750 });
      const buyer = await createActor(h);
      const address = await createAddress(h, buyer.userId);
      const order = await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [{ productId: product.id, name: product.name, price: 750 }],
        status: 'pending_payment',
      });
      await h.prisma.order.update({
        where: { id: order.id },
        data: { paymentMethod: 'razorpay' },
      });
      return { buyer, orderId: order.id, total: Number(order.total) };
    }

    it('hands back the same razorpayOrderId when checkout is submitted twice', async () => {
      const { buyer, orderId } = await orderAwaitingRazorpay();

      const [first, second] = await Promise.all([
        h
          .api()
          .post(`${API_PREFIX}/payments/razorpay/order`)
          .set(auth(buyer))
          .send({ purpose: 'order', orderId })
          .expect(201),
        h
          .api()
          .post(`${API_PREFIX}/payments/razorpay/order`)
          .set(auth(buyer))
          .send({ purpose: 'order', orderId })
          .expect(201),
      ]);

      // Two *live* Razorpay orders for one Homekrafted order are two real
      // payment pages. A buyer who paid both was charged twice and
      // credited once: the webhook transitions the order on the first
      // capture, and the second finds nothing to apply itself to.
      expect(second.body.razorpayOrderId).toBe(first.body.razorpayOrderId);
      const open = await h.prisma.razorpayOrder.findMany({ where: { orderId, status: 'created' } });
      expect(open).toHaveLength(1);
    });

    it('opens a fresh one once the order total has changed', async () => {
      // The stale row is for the wrong money and must never be reused —
      // handing it back would charge the old total for the new order.
      const { buyer, orderId } = await orderAwaitingRazorpay();
      const first = await h
        .api()
        .post(`${API_PREFIX}/payments/razorpay/order`)
        .set(auth(buyer))
        .send({ purpose: 'order', orderId })
        .expect(201);

      await h.prisma.order.update({ where: { id: orderId }, data: { total: 900 } });

      const second = await h
        .api()
        .post(`${API_PREFIX}/payments/razorpay/order`)
        .set(auth(buyer))
        .send({ purpose: 'order', orderId })
        .expect(201);

      expect(second.body.razorpayOrderId).not.toBe(first.body.razorpayOrderId);
      expect(second.body.amount).toBe(900);
    });

    it('still opens a second Razorpay order for a second wallet top-up', async () => {
      // Top-ups have no such invariant: two ₹500 top-ups are two
      // legitimate top-ups and both credit. Collapsing them would
      // silently swallow the second.
      const buyer = await createActor(h);
      const first = await h
        .api()
        .post(`${API_PREFIX}/payments/razorpay/order`)
        .set(auth(buyer))
        .send({ purpose: 'topup', amount: 500 })
        .expect(201);
      const second = await h
        .api()
        .post(`${API_PREFIX}/payments/razorpay/order`)
        .set(auth(buyer))
        .send({ purpose: 'topup', amount: 500 })
        .expect(201);

      expect(second.body.razorpayOrderId).not.toBe(first.body.razorpayOrderId);
    });
  });

  describe('a redelivered WhatsApp message creates one SnackOrder', () => {
    /**
     * Driven through the service rather than `POST /whatsapp/webhook`.
     * The controller needs `req.rawBody` for its HMAC check, which the
     * harness app does not wire (`main.ts` passes `{ rawBody: true }`;
     * `createNestApplication()` does not), so an HTTP-level test here
     * would assert on the signature path and never reach the dedup one.
     */
    const inbound = () => h.app.get(WhatsAppInboundService);

    async function snackOnMenu() {
      const { seller } = await createKitchen(h);
      return h.prisma.snack.create({
        data: {
          slug: `snack-${Date.now()}`,
          sellerId: seller.id,
          name: 'Masala Mathri',
          description: 'Crisp, layered, fried in ghee.',
          price: 120,
          imagePlaceholder: 'mathri',
          category: 'namkeen',
          diet: 'veg',
        },
      });
    }

    const payload = (messageId: string, body: string) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Ananya' }, wa_id: '919845012345' }],
                messages: [{ from: '919845012345', id: messageId, type: 'text', text: { body } }],
              },
            },
          ],
        },
      ],
    });

    it('ignores the second delivery of the same message id', async () => {
      await snackOnMenu();
      const message = payload('wamid.RETRY', '2x Masala Mathri');

      // Meta's Cloud API retries any delivery it does not get a timely
      // 200 for. Before the fix this replayed the whole handler: one
      // customer list became two SnackOrders, and a HomeKrafter cooked
      // the order twice with nothing on either row saying which was real.
      await inbound().handle(message);
      await inbound().handle(message);

      const orders = await h.prisma.snackOrder.findMany({ include: { items: true } });
      expect(orders).toHaveLength(1);
      expect(orders[0].items).toHaveLength(1);
      expect(orders[0].items[0].quantity).toBe(2);
      expect(Number(orders[0].total)).toBe(240);
    });

    it('still creates a second order for a genuinely new message', async () => {
      await snackOnMenu();
      await inbound().handle(payload('wamid.FIRST', '1x Masala Mathri'));
      await inbound().handle(payload('wamid.SECOND', '1x Masala Mathri'));

      expect(await h.prisma.snackOrder.count()).toBe(2);
    });

    it('claims the message id in the same transaction as the orders', async () => {
      await snackOnMenu();
      await inbound().handle(payload('wamid.CLAIM', '1x Masala Mathri'));

      const claim = await h.prisma.webhookEvent.findFirst({ where: { provider: 'whatsapp' } });
      expect(claim?.eventId).toBe('message:wamid.CLAIM');
    });

    it('records nothing at all for a message that matches no snack', async () => {
      // The claim must not be spent on a message that produced no order —
      // otherwise a menu fixed a minute later can never be re-delivered.
      await snackOnMenu();
      await inbound().handle(payload('wamid.NOMATCH', '1x Something Nobody Sells'));

      expect(await h.prisma.snackOrder.count()).toBe(0);
      expect(await h.prisma.webhookEvent.count({ where: { provider: 'whatsapp' } })).toBe(0);
    });
  });
});
