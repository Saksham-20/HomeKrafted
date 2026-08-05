import * as crypto from 'crypto';
import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createCategory,
  createHarness,
  createKitchen,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * Corporate quotes (M20) — the funnel, and the bearer token at the end of
 * it.
 *
 * The accept link is emailed to a procurement manager who has no account
 * and will not make one. That makes the token the only credential, and a
 * forwardable one: everything below exists because the failure modes are
 * a duplicate ₹50,000 commitment, a probe that reveals which tokens are
 * real, or a line no kitchen can see.
 */
describe('corporate quotes', () => {
  let h: Harness;
  let admin: Actor;
  let seller: Actor;
  let vendorId: string;
  let categoryId: string;
  let inquiryId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    admin = await createActor(h, 'admin');
    const kitchen = await createKitchen(h);
    vendorId = kitchen.vendor.id;
    seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
    categoryId = (await createCategory(h)).id;

    inquiryId = (await seedInquiry()).id;
  });

  const INQUIRY = {
    companyName: 'Northline Consulting',
    contactName: 'Priya Menon',
    email: 'priya@northline.example',
    phone: '9876500011',
    occasion: 'Diwali',
    estimatedQuantity: 50,
    message: 'Fifty hampers for clients, delivered before the 8th.',
  };

  /**
   * Setup path: the same row the public form would have written, without
   * spending throttle budget.
   *
   * `POST /corporate-inquiries` carries its own `@Throttle({ limit: 5 })`,
   * which `test/e2e/env.ts`'s raised global budgets deliberately do not
   * override. A spec that submits through HTTP in every `beforeEach`
   * starts 429ing partway and fails for a reason that has nothing to do
   * with what it asserts. That throttle is wanted behaviour on an
   * unauthenticated endpoint that fans out a notification per admin — the
   * fix is for setup to stop using the front door, not to weaken it.
   * Same reasoning as `seller-application-area.e2e-spec.ts`.
   */
  const seedInquiry = () => h.prisma.corporateInquiry.create({ data: { ...INQUIRY } });

  /** Real HTTP intake. Use only where the **endpoint** is under test. */
  const submitHttp = () => h.api().post(`${API_PREFIX}/corporate-inquiries`).send(INQUIRY);

  /** A day from now, so `validUntil` is in the future unless a test says otherwise. */
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

  const buildQuote = (overrides: Record<string, unknown> = {}) =>
    h
      .api()
      .post(`${API_PREFIX}/admin/corporate-inquiries/${inquiryId}/quotes`)
      .set(auth(admin))
      .send({
        validUntil: tomorrow(),
        taxAmount: 500,
        deliveryFee: 250,
        lines: [{ vendorId, description: 'Custom Diwali hamper', quantity: 50, unitPrice: 800 }],
        ...overrides,
      });

  /**
   * Builds a quote, sends it, then re-keys the stored hash to a token this
   * test knows.
   *
   * The same technique `password-reset.e2e-spec.ts` uses, and for the same
   * reason: the raw token is returned once, into an email, and never
   * stored — so a test cannot read it back. This proves the *rules* around
   * the token (single-use, rotation, revocation, expiry, the concurrent
   * claim); it deliberately cannot prove the emailed link itself.
   */
  async function sentQuote(): Promise<{ quoteId: string; token: string }> {
    const quote = await buildQuote().expect(201);
    await h
      .api()
      .post(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quote.body.id}/send`)
      .set(auth(admin))
      .expect(201);
    return { quoteId: quote.body.id, token: await reKey(quote.body.id) };
  }

  /** Overwrites a quote's stored hash with one whose token we hold. */
  async function reKey(quoteId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');
    await h.prisma.corporateQuote.update({
      where: { id: quoteId },
      data: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
    });
    return token;
  }

  /**
   * Notification delivery is fire-and-forget — a lead must not fail to
   * record because a message failed — so the rows land after the response.
   * Polls rather than sleeping a fixed time: a fast machine returns
   * immediately and a slow one still passes.
   */
  async function waitForNotifications(userId: string, deadlineMs = 20_000) {
    const started = Date.now();
    for (;;) {
      const rows = await h.prisma.notification.findMany({
        where: { userId, refType: 'corporateInquiry' },
      });
      if (rows.length > 0) return rows;
      if (Date.now() - started > deadlineMs) return rows;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  describe('the inbound lead', () => {
    it('notifies every admin, which is the bug that mattered', async () => {
      // Until M20 this wrote a row and told nobody, and nothing read the
      // table. A ₹5k–₹50k lead arrived and sat there.
      await submitHttp().expect(201);
      const notifications = await waitForNotifications(admin.userId);
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].title).toContain('Northline Consulting');
    });

    it('is throttled, because it fans out a message per admin', async () => {
      /*
        Unauthenticated, and each call becomes a per-admin, per-channel
        delivery. Defaults are in-app only today, so it writes rows — but
        the first admin who enables email for `account` turns this into a
        mail sender, and 120/min/IP would have been the budget.
      */
      const codes: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        codes.push((await submitHttp()).status);
      }
      // Not an exact split: the throttle window is per-IP and shared with
      // the sibling test above, so how many get through depends on run
      // order. The claim being pinned is that it refuses, and that it
      // never lets more than the stated budget through.
      expect(codes).toContain(429);
      expect(codes.filter((c) => c === 201).length).toBeLessThanOrEqual(5);
    });

    it('appears on the admin queue', async () => {
      const res = await h
        .api()
        .get(`${API_PREFIX}/admin/corporate-inquiries`)
        .set(auth(admin))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.summary.unworked).toBe(1);
      expect(res.body.items[0].companyName).toBe('Northline Consulting');
    });

    it('is not readable by a seller or anonymously', async () => {
      await h.api().get(`${API_PREFIX}/admin/corporate-inquiries`).set(auth(seller)).expect(403);
      await h.api().get(`${API_PREFIX}/admin/corporate-inquiries`).expect(401);
    });
  });

  describe('building a quote', () => {
    it('totals the lines and adds tax and delivery', async () => {
      // 50 × 800 = 40,000 subtotal; + 500 tax + 250 delivery = 40,750.
      // Computed by hand: recording a number from a run locks in the bug.
      const res = await buildQuote().expect(201);
      expect(res.body.subtotal).toBe(40000);
      expect(res.body.total).toBe(40750);
      expect(res.body.lines[0].lineTotal).toBe(40000);
    });

    it('refuses a line naming no kitchen that exists', async () => {
      /*
        Seller order visibility, seller notifications and payouts all
        resolve ownership through the vendor. A line nobody owns is work
        no kitchen can see and money nobody can be paid — refused here
        rather than discovered at fulfilment.
      */
      await buildQuote({
        lines: [{ vendorId: 'vendor-that-does-not-exist', description: 'x', quantity: 1, unitPrice: 1 }],
      }).expect(400);
    });

    it('refuses a catalogue line filed under the wrong kitchen', async () => {
      // Otherwise the wrong person gets paid.
      const otherKitchen = await createKitchen(h);
      const product = await createProduct(h, otherKitchen.vendor.id, categoryId);
      await buildQuote({
        lines: [
          { productId: product.id, vendorId, description: 'Pickles', quantity: 10, unitPrice: 250 },
        ],
      }).expect(400);
    });

    it('refuses an empty quote', async () => {
      await buildQuote({ lines: [] }).expect(400);
    });

    it('accepts a custom line with no catalogue reference', async () => {
      // Half of corporate gifting is "custom hamper, 50 units, our
      // branding". Forcing that into a catalogue reference loses the deal.
      const res = await buildQuote().expect(201);
      expect(res.body.lines[0].productId).toBeUndefined();
      expect(res.body.lines[0].vendorName).toBeTruthy();
    });
  });

  describe('the token', () => {
    it('is never returned by any admin read', async () => {
      const { quoteId } = await sentQuote();
      const res = await h
        .api()
        .get(`${API_PREFIX}/admin/corporate-inquiries/${inquiryId}`)
        .set(auth(admin))
        .expect(200);
      const quote = res.body.quotes.find((q: { id: string }) => q.id === quoteId);
      expect(quote.hasLiveLink).toBe(true);
      expect(JSON.stringify(quote)).not.toContain('tokenHash');
    });

    it('is stored only as a hash', async () => {
      const { token } = await sentQuote();
      const rows = await h.prisma.corporateQuote.findMany();
      expect(rows[0].tokenHash).toBeTruthy();
      expect(rows[0].tokenHash).not.toBe(token);
    });

    it('reads the quote without any login', async () => {
      const { token } = await sentQuote();
      const res = await h.api().get(`${API_PREFIX}/corporate/quotes/${token}`).expect(200);
      expect(res.body.status).toBe('valid');
      expect(res.body.total).toBe(40750);
      expect(res.body.companyName).toBe('Northline Consulting');
    });

    it('never exposes which kitchen supplies which line', async () => {
      // Our commercial arrangement, not the customer's.
      const { token } = await sentQuote();
      const res = await h.api().get(`${API_PREFIX}/corporate/quotes/${token}`).expect(200);
      expect(JSON.stringify(res.body)).not.toContain(vendorId);
      expect(res.body.lines[0].vendorName).toBeUndefined();
    });

    it('cannot read any other quote', async () => {
      const first = await sentQuote();
      const otherInquiry = await h.prisma.corporateInquiry.create({
        data: {
          companyName: 'Someone Else Ltd',
          contactName: 'A N Other',
          email: 'other@example.com',
          phone: '9000000000',
          estimatedQuantity: 5,
          message: 'x',
        },
      });
      const otherQuote = await h.prisma.corporateQuote.create({
        data: {
          inquiryId: otherInquiry.id,
          createdById: admin.userId,
          validUntil: new Date(Date.now() + 86_400_000),
          subtotal: 1,
          total: 1,
          status: 'sent',
          tokenHash: 'a-different-hash',
        },
      });

      const res = await h.api().get(`${API_PREFIX}/corporate/quotes/${first.token}`).expect(200);
      expect(res.body.companyName).toBe('Northline Consulting');
      expect(res.body.companyName).not.toBe(otherQuote.id);
    });

    it('makes not-found and revoked indistinguishable', async () => {
      /*
        Same status, same body. Telling them apart tells somebody holding
        a stale link whether it was ever real.
      */
      const { quoteId, token } = await sentQuote();
      const missing = await h.api().get(`${API_PREFIX}/corporate/quotes/no-such-token`).expect(404);

      await h
        .api()
        .delete(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quoteId}/link`)
        .set(auth(admin))
        .expect(200);

      const revoked = await h.api().get(`${API_PREFIX}/corporate/quotes/${token}`).expect(404);
      expect(revoked.body.error.code).toBe(missing.body.error.code);
      expect(revoked.body.error.message).toBe(missing.body.error.message);
    });

    it('is rotated by re-sending, killing the previous link', async () => {
      // A quote forwarded before a correction must not stay acceptable.
      const first = await sentQuote();
      await h.api().get(`${API_PREFIX}/corporate/quotes/${first.token}`).expect(200);

      // Re-sending mints a fresh hash over the old one.
      await h
        .api()
        .post(`${API_PREFIX}/admin/corporate-inquiries/quotes/${first.quoteId}/send`)
        .set(auth(admin))
        .expect(201);

      await h.api().get(`${API_PREFIX}/corporate/quotes/${first.token}`).expect(404);
    });
  });

  describe('accepting', () => {
    it('records who accepted, by name', async () => {
      const { token } = await sentQuote();
      const res = await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
        .send({ acceptedName: 'Priya Menon' })
        .expect(200);

      expect(res.body.status).toBe('accepted');
      expect(res.body.acceptedName).toBe('Priya Menon');
      expect(res.body.acceptedAt).toBeTruthy();
    });

    it('treats a second click as the receipt, not an error', async () => {
      // A procurement manager reopening their emailed link is the ordinary
      // case. Encoding it as an error forces clients to parse messages.
      const { token } = await sentQuote();
      await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
        .send({ acceptedName: 'Priya Menon' })
        .expect(200);

      const again = await h.api().get(`${API_PREFIX}/corporate/quotes/${token}`).expect(200);
      expect(again.body.status).toBe('accepted');
      expect(again.body.acceptedName).toBe('Priya Menon');
    });

    it('is accepted exactly once under concurrent requests', async () => {
      /*
        The 2am failure: a link forwarded to finance, opened twice at
        once. A read-then-write would let both see `sent` and both accept.
        The claim is a conditional updateMany, and `IdempotencyService`
        does not help here — it is user-scoped and this caller is
        anonymous.
      */
      const { token } = await sentQuote();
      const attempts = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          h
            .api()
            .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
            .send({ acceptedName: `Person ${i}` }),
        ),
      );

      expect(attempts.every((r) => r.status === 200)).toBe(true);
      const rows = await h.prisma.corporateQuote.findMany({ where: { status: 'accepted' } });
      expect(rows).toHaveLength(1);
      // Exactly one name won, and every response agrees on it.
      const names = new Set(attempts.map((r) => r.body.acceptedName));
      expect(names.size).toBe(1);
      expect(rows[0].acceptedName).toBe([...names][0]);
    });

    it('creates no orders', async () => {
      /*
        The recorded narrowing. `Order.userId`, `OrderItem.addressId` and
        `OrderShipment.addressId` are all required and a CorporateInquiry
        has no user and no address — the schema cannot express a corporate
        order. Writing one anyway would push an uncollected five-figure
        amount into GMV, into the payouts queue as a real debt to a home
        cook, and through computeCashback as ~5% credited to a stranger.
      */
      const { token } = await sentQuote();
      await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
        .send({ acceptedName: 'Priya Menon' })
        .expect(200);

      expect(await h.prisma.order.count()).toBe(0);
      expect(await h.prisma.payout.count()).toBe(0);
    });

    it('refuses an expired quote', async () => {
      const { quoteId, token } = await sentQuote();
      await h.prisma.corporateQuote.update({
        where: { id: quoteId },
        data: { validUntil: new Date(Date.now() - 1000) },
      });

      const read = await h.api().get(`${API_PREFIX}/corporate/quotes/${token}`).expect(200);
      expect(read.body.status).toBe('expired');

      await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
        .send({ acceptedName: 'Priya Menon' })
        .expect(409);
    });

    it('refuses a revoked quote', async () => {
      const { quoteId, token } = await sentQuote();
      await h
        .api()
        .delete(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quoteId}/link`)
        .set(auth(admin))
        .expect(200);

      await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
        .send({ acceptedName: 'Priya Menon' })
        .expect(404);
    });

    it('requires a typed name', async () => {
      // A timestamp alone is not evidence of who agreed to five figures.
      const { token } = await sentQuote();
      await h.api().post(`${API_PREFIX}/corporate/quotes/${token}/accept`).send({}).expect(400);
    });

    it('lets a customer decline, so the row does not sit at sent forever', async () => {
      const { token } = await sentQuote();
      const res = await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/decline`)
        .expect(200);
      expect(res.body.status).toBe('declined');
    });
  });

  describe('editing', () => {
    it('refuses to reprice a quote that has been sent', async () => {
      // Somebody is looking at the old number. Withdraw and re-raise.
      const { quoteId } = await sentQuote();
      await h
        .api()
        .patch(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quoteId}`)
        .set(auth(admin))
        .send({ lines: [{ vendorId, description: 'Cheaper', quantity: 50, unitPrice: 100 }] })
        .expect(409);
    });

    it('does not reopen repricing on a quote somebody already accepted', async () => {
      /*
        Withdrawing the link of a `sent` quote drops it back to `draft` on
        purpose — nobody should be reading that number any more, so it
        becomes re-pricable and can be raised again.

        Doing the same to an **accepted** quote undid three things at once:
        the admin queue showed a closed deal as never sent,
        `acceptedAt`/`acceptedName` sat on a row calling itself a draft,
        and this 409 — which exists so nobody edits a number a customer is
        reading — quietly reopened on a number a customer had already
        agreed to.

        Found by revoking an accepted quote on production, not by reading
        the code.
      */
      const { quoteId, token } = await sentQuote();
      await h
        .api()
        .post(`${API_PREFIX}/corporate/quotes/${token}/accept`)
        .send({ acceptedName: 'Priya Raman' })
        .expect(200);

      await h
        .api()
        .delete(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quoteId}/link`)
        .set(auth(admin))
        .expect(200);

      const after = await h.prisma.corporateQuote.findUniqueOrThrow({ where: { id: quoteId } });
      // The link is dead — a forwarded email must stop working once the
      // deal is closed — but what happened is untouched.
      expect(after.tokenHash).toBeNull();
      expect(after.revokedAt).not.toBeNull();
      expect(after.status).toBe('accepted');
      expect(after.acceptedName).toBe('Priya Raman');

      await h
        .api()
        .patch(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quoteId}`)
        .set(auth(admin))
        .send({ lines: [{ vendorId, description: 'Cheaper after the fact', quantity: 50, unitPrice: 1 }] })
        .expect(409);
    });

    it('reprices a draft', async () => {
      const quote = await buildQuote().expect(201);
      const res = await h
        .api()
        .patch(`${API_PREFIX}/admin/corporate-inquiries/quotes/${quote.body.id}`)
        .set(auth(admin))
        .send({ lines: [{ vendorId, description: 'Smaller run', quantity: 20, unitPrice: 800 }] })
        .expect(200);
      // 20 × 800 = 16,000, plus the tax and delivery already on it.
      expect(res.body.subtotal).toBe(16000);
      expect(res.body.total).toBe(16750);
    });
  });

  describe('sending moves the inquiry along', () => {
    it('marks the inquiry quoted, so the queue reflects it', async () => {
      await sentQuote();
      const inquiry = await h.prisma.corporateInquiry.findUniqueOrThrow({
        where: { id: inquiryId },
      });
      expect(inquiry.status).toBe('quoted');
    });

    it('records the send without ever logging the token', async () => {
      await sentQuote();
      const log = await h.prisma.adminAuditLog.findFirst({
        where: { action: 'corporate.quote.send' },
      });
      expect(log).toBeTruthy();
      expect(JSON.stringify(log?.metadata)).not.toMatch(/token/i);
    });
  });
});
