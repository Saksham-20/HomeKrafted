import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  errorOf,
  resetDatabase,
} from './harness';

/**
 * Payouts — the one place in this system where a row stands in for money
 * that has already left a bank account.
 *
 * **`POST /admin/payouts/:id/pay` records a settlement, it does not
 * perform one.** There is no payout provider wired to anything, so the
 * `reference` is the only link between this row and a real transfer. Both
 * decisions are therefore **one-way**: an admin who has told a HomeKrafter
 * they have been paid cannot quietly un-tell them, and the state machine
 * is what stops a double payment being one careless click away.
 */
describe('admin payouts', () => {
  let h: Harness;
  let admin: Actor;
  let sellerId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const kitchen = await createKitchen(h);
    sellerId = kitchen.seller.id;
    admin = await createActor(h, 'admin');
  });

  async function pendingPayout(amount = 4500) {
    return h.prisma.payout.create({
      data: {
        sellerId,
        amount,
        status: 'pending',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });
  }

  const pay = (actor: Actor, id: string, body: object = {}) =>
    h.api().post(`${API_PREFIX}/admin/payouts/${id}/pay`).set(auth(actor)).send(body);

  const reject = (actor: Actor, id: string, note = 'Bank details do not match') =>
    h.api().post(`${API_PREFIX}/admin/payouts/${id}/reject`).set(auth(actor)).send({ note });

  describe('recording a settlement', () => {
    it('marks it paid and keeps the reference that links it to a real transfer', async () => {
      const payout = await pendingPayout();
      await pay(admin, payout.id, { reference: 'UTR123456789' }).expect(201);

      const after = await h.prisma.payout.findUnique({ where: { id: payout.id } });
      expect(after!.status).toBe('paid');
      expect(after!.reference).toBe('UTR123456789');
      expect(after!.paidAt).toBeInstanceOf(Date);
      expect(after!.decidedById).toBe(admin.userId);
    });

    it('allows settling before the reference is back, since a batch often is', async () => {
      const payout = await pendingPayout();
      await pay(admin, payout.id, {}).expect(201);
      expect((await h.prisma.payout.findUnique({ where: { id: payout.id } }))!.status).toBe('paid');
    });

    it('moves no money, because there is nothing here that could', async () => {
      // Worth pinning down explicitly: if a payout provider is ever wired
      // in, this test is the one that should be updated deliberately
      // rather than discovered to be wrong.
      const payout = await pendingPayout();
      const walletRows = await h.prisma.walletTransaction.count();
      await pay(admin, payout.id, { reference: 'UTR1' }).expect(201);
      expect(await h.prisma.walletTransaction.count()).toBe(walletRows);
    });

    it('tells the HomeKrafter, on every default transactional channel (M37)', async () => {
      // "Your payout is on its way" was in-app only until M37 — an inbox
      // behind a login, for money on the move. It now goes through
      // `deliver()`, which writes one row per channel the account's
      // preferences enable (whatsapp + email + inapp by default;
      // providers degrade to logged stubs without keys, the row is still
      // the record of the attempt).
      const payout = await pendingPayout();
      // WhatsApp needs a number on file — give the kitchen one, as any
      // real account has (`sendOnChannel` skips a channel with no
      // contact rather than failing it).
      const seller = await h.prisma.seller.findUniqueOrThrow({ where: { id: sellerId } });
      await h.prisma.user.update({
        where: { id: seller.userId },
        data: { phone: '+919845000111' },
      });

      await pay(admin, payout.id, { reference: 'UTR1' }).expect(201);

      const rows = await h.prisma.notification.findMany({ where: { category: 'wallet' } });
      expect(rows.length).toBeGreaterThan(0);
      const channels = new Set(rows.map((r) => r.channel));
      expect(channels).toEqual(new Set(['whatsapp', 'email', 'inapp']));
    });
  });

  describe('both decisions are one-way', () => {
    it('refuses to pay a payout that is already paid', async () => {
      const payout = await pendingPayout();
      await pay(admin, payout.id, { reference: 'UTR1' }).expect(201);

      const res = await pay(admin, payout.id, { reference: 'UTR2' }).expect(409);
      expect(errorOf(res).message).toMatch(/already/i);

      // And the original reference survives — a second attempt must not
      // overwrite the link to the transfer that actually happened.
      expect((await h.prisma.payout.findUnique({ where: { id: payout.id } }))!.reference).toBe('UTR1');
    });

    it('refuses to reject a payout that has been paid', async () => {
      const payout = await pendingPayout();
      await pay(admin, payout.id, { reference: 'UTR1' }).expect(201);
      await reject(admin, payout.id).expect(409);
      expect((await h.prisma.payout.findUnique({ where: { id: payout.id } }))!.status).toBe('paid');
    });

    it('refuses to pay a payout that has been rejected', async () => {
      const payout = await pendingPayout();
      await reject(admin, payout.id).expect(201);
      await pay(admin, payout.id, { reference: 'UTR1' }).expect(409);
      expect((await h.prisma.payout.findUnique({ where: { id: payout.id } }))!.status).toBe('rejected');
    });
  });

  describe('a refusal has to say why', () => {
    it('requires a note', async () => {
      // A payout refused with no explanation is worse than one that never
      // happened — the HomeKrafter needs to know whether to fix something
      // and re-request.
      const payout = await pendingPayout();
      await h
        .api()
        .post(`${API_PREFIX}/admin/payouts/${payout.id}/reject`)
        .set(auth(admin))
        .send({})
        .expect(400);
      expect((await h.prisma.payout.findUnique({ where: { id: payout.id } }))!.status).toBe('pending');
    });

    it('stores the note where the HomeKrafter reads it', async () => {
      const payout = await pendingPayout();
      await reject(admin, payout.id, 'Bank details do not match your PAN').expect(201);
      const after = await h.prisma.payout.findUnique({ where: { id: payout.id } });
      expect(after!.note).toBe('Bank details do not match your PAN');
      expect(after!.decidedAt).toBeInstanceOf(Date);
    });
  });

  describe('who can decide', () => {
    it('refuses a HomeKrafter settling their own payout', async () => {
      // The obvious attack, and the one the role split exists for.
      const payout = await pendingPayout();
      const seller = await createActor(h, 'seller', { sellerId });
      await pay(seller, payout.id, { reference: 'UTR1' }).expect(403);
      expect((await h.prisma.payout.findUnique({ where: { id: payout.id } }))!.status).toBe('pending');
    });

    it('refuses a consumer and an anonymous caller', async () => {
      const payout = await pendingPayout();
      const buyer = await createActor(h);
      await pay(buyer, payout.id, {}).expect(403);
      await h.api().post(`${API_PREFIX}/admin/payouts/${payout.id}/pay`).send({}).expect(401);
    });

    it('404s on a payout that does not exist', async () => {
      await pay(admin, 'no-such-payout', {}).expect(404);
    });
  });

  describe('what a HomeKrafter sees', () => {
    it('shows them their own payouts and nobody else\'s', async () => {
      await pendingPayout(4500);
      const otherKitchen = await createKitchen(h, { name: 'Other Kitchen' });
      await h.prisma.payout.create({
        data: {
          sellerId: otherKitchen.seller.id,
          amount: 99999,
          status: 'pending',
          periodStart: new Date('2026-07-01'),
          periodEnd: new Date('2026-07-31'),
        },
      });

      const seller = await createActor(h, 'seller', { sellerId });
      const res = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(seller)).expect(200);
      const amounts = JSON.stringify(res.body);
      expect(amounts).toContain('4500');
      expect(amounts).not.toContain('99999');
    });
  });
});
