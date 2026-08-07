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
 * The referral programme, which the 2026-08-07 audit found was built from
 * neither end.
 *
 * **Nothing created a `Referral`.** `RegisterDto` accepted
 * `referredByCode` and `User.referredByCode` stored it, and no code path
 * in the server ever read that column. Every row on `/account/referrals`
 * came from the seed, so a real person could copy their code, watch a
 * friend sign up with it, and see the invite never appear — under a page
 * promising "you both get ₹250".
 *
 * **And the reward was a button.** `POST /referrals/:id/apply-credit`
 * credited ₹250 gated on nothing but the row existing, and the account
 * page shipped an "Apply referral credit (demo)" control that called it.
 * A shopper granting themselves a wallet credit is the same shape as the
 * open review endpoint M15 closed, for the same reason.
 */
describe('a referral', () => {
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

  async function signUp(name: string, referredByCode?: string) {
    const email = `referee-${Math.random().toString(36).slice(2, 10)}@example.com`;
    const res = await h
      .api()
      .post(`${API_PREFIX}/auth/register`)
      .send({ name, email, password: 'Passw0rd!123', referredByCode })
      .expect(201);
    return res.body.user as { id: string; referralCode: string };
  }

  /** Marks the referee as having actually received something they ordered. */
  async function deliverAnOrderFor(userId: string) {
    const address = await createAddress(h, userId);
    const { vendor } = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id, { price: 250 });
    return createOrder(h, {
      userId,
      addressId: address.id,
      items: [{ productId: product.id, name: 'Mango thokku pickle', price: 250 }],
      status: 'delivered',
    });
  }

  describe('is recorded when a friend signs up with the code', () => {
    it('creates a joined referral against the referrer', async () => {
      const referrer = await createActor(h);
      const referrerRow = await h.prisma.user.findUniqueOrThrow({ where: { id: referrer.userId } });

      const referee = await signUp('Audit Friend', referrerRow.referralCode);

      const referrals = await h.prisma.referral.findMany({
        where: { referrerUserId: referrer.userId },
      });
      expect(referrals).toHaveLength(1);
      expect(referrals[0]).toMatchObject({
        code: referrerRow.referralCode,
        refereeUserId: referee.id,
        refereeName: 'Audit Friend',
        // `joined`, not `rewarded` — the money has its own gate.
        status: 'joined',
      });
    });

    it('still creates the account when the code matches nobody', async () => {
      // A mistyped code must not fail a signup, and the response must not
      // reveal whether the code exists — that would make registration an
      // oracle over the code space. Same reasoning as `forgotPassword`.
      const referee = await signUp('No Referrer', 'NOSUCHCODE999');

      expect(referee.id).toBeTruthy();
      expect(await h.prisma.referral.count()).toBe(0);
    });

    it('records nothing when no code was given', async () => {
      await signUp('Walked In');
      expect(await h.prisma.referral.count()).toBe(0);
    });

    it('refuses to let somebody refer themselves', async () => {
      // Reachable, and not obviously so. Codes are derived from the first
      // name (`generateReferralCode`: `ANANYA250`), and the referrer
      // lookup runs *inside* the signup transaction — after the row is
      // inserted. So somebody signing up as "Ananya" and guessing
      // `ANANYA250` finds their own brand-new account and refers
      // themselves, which on a live programme is ₹250 for registering.
      const name = `Selfref${Math.random().toString(36).slice(2, 8)}`;
      const ownCode = `${name.toUpperCase()}250`;

      const referee = await h
        .api()
        .post(`${API_PREFIX}/auth/register`)
        .send({
          name,
          email: `self-${Math.random().toString(36).slice(2, 8)}@example.com`,
          password: 'Passw0rd!123',
          referredByCode: ownCode,
        })
        .expect(201);

      // The guess was right about their own code…
      expect(referee.body.user.referralCode).toBe(ownCode);
      // …and it bought them nothing.
      expect(await h.prisma.referral.count()).toBe(0);
    });
  });

  describe('pays out only once the friend has actually received an order', () => {
    async function referralFor(referrer: Actor) {
      const row = await h.prisma.user.findUniqueOrThrow({ where: { id: referrer.userId } });
      const referee = await signUp('Audit Friend', row.referralCode);
      const referral = await h.prisma.referral.findFirstOrThrow({
        where: { referrerUserId: referrer.userId },
      });
      return { referral, refereeId: referee.id };
    }

    const claim = (referrer: Actor, referralId: string) =>
      h.api().post(`${API_PREFIX}/referrals/${referralId}/apply-credit`).set(auth(referrer));

    it('refuses while the friend has ordered nothing, and moves no money', async () => {
      const referrer = await createActor(h);
      const { referral } = await referralFor(referrer);

      const res = await claim(referrer, referral.id).expect(409);
      expect(res.body.error.message).toMatch(/delivered/i);

      expect(
        await h.prisma.walletTransaction.count({ where: { category: 'referral' } }),
      ).toBe(0);
    });

    it('refuses while the order is only placed — not delivered', async () => {
      // Placed is not enough: a place-then-cancel round trip would
      // otherwise pay ₹250 for nothing, the exact hole M22 closed on
      // cashback.
      const referrer = await createActor(h);
      const { referral, refereeId } = await referralFor(referrer);
      const address = await createAddress(h, refereeId);
      const { vendor } = await createKitchen(h);
      const category = await createCategory(h);
      const product = await createProduct(h, vendor.id, category.id, { price: 250 });
      await createOrder(h, {
        userId: refereeId,
        addressId: address.id,
        items: [{ productId: product.id, name: 'Pickle', price: 250 }],
        status: 'placed',
      });

      await claim(referrer, referral.id).expect(409);
      expect(
        await h.prisma.walletTransaction.count({ where: { category: 'referral' } }),
      ).toBe(0);
    });

    it('refuses an invite that never became an account', async () => {
      const referrer = await createActor(h);
      const orphan = await h.prisma.referral.create({
        data: { referrerUserId: referrer.userId, code: 'WHATEVER', refereeName: 'A Friend' },
      });

      const res = await claim(referrer, orphan.id).expect(409);
      expect(res.body.error.message).toMatch(/joined/i);
    });

    it('credits ₹250 exactly once when the friend has a delivered order', async () => {
      const referrer = await createActor(h);
      const { referral, refereeId } = await referralFor(referrer);
      await deliverAnOrderFor(refereeId);

      const res = await claim(referrer, referral.id).expect(201);
      expect(res.body.rewardAmount).toBe(250);

      const credits = await h.prisma.walletTransaction.findMany({ where: { category: 'referral' } });
      expect(credits).toHaveLength(1);
      expect(Number(credits[0].amount)).toBe(250);

      // Second attempt is refused, and adds nothing.
      await claim(referrer, referral.id).expect(409);
      expect(
        await h.prisma.walletTransaction.count({ where: { category: 'referral' } }),
      ).toBe(1);
    });

    it('refuses somebody else’s referral', async () => {
      const referrer = await createActor(h);
      const stranger = await createActor(h);
      const { referral, refereeId } = await referralFor(referrer);
      await deliverAnOrderFor(refereeId);

      await claim(stranger, referral.id).expect(404);
      expect(
        await h.prisma.walletTransaction.count({ where: { category: 'referral' } }),
      ).toBe(0);
    });
  });
});
