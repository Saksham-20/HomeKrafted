import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  errorOf,
  resetDatabase,
} from './harness';

/**
 * Auto top-up must never credit money nobody paid.
 *
 * `WalletService#maybeFireAutoTopupTx` used to post a `credit`/`topup`
 * ledger entry for `rule.topupAmount` whenever a debit dropped the balance
 * below the rule's threshold — with **no Razorpay charge behind it**.
 * `PUT /wallet/auto-topup` is owner-scoped and its DTO capped nothing, so
 * any signed-in shopper could set a large `topupAmount`, spend once, and
 * mint real spendable balance that buys real food from real home kitchens
 * who then draw real payouts against it.
 *
 * The bug survived review because `wallet.controller.ts`'s own doc comment
 * asserted that admin `adjust` was the only ungated credit path. It wasn't.
 * Nothing in either test layer touched auto-top-up, so nothing caught it.
 *
 * These tests exist so the fix cannot silently regress. The first one is
 * the load-bearing assertion: **the rule is enabled and firing-eligible,
 * and the balance still only goes down.**
 */
describe('Wallet auto top-up (disabled — must not credit)', () => {
  let h: Harness;
  let buyer: Actor;
  let admin: Actor;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    buyer = await createActor(h, 'consumer');
    admin = await createActor(h, 'admin');
  });

  /** Seeds a wallet with a starting balance and an enabled, firing-eligible rule. */
  async function seedWalletWithEnabledRule(opts: {
    balance: number;
    threshold: number;
    topupAmount: number;
  }) {
    // `GET /wallet` creates the wallet row on first read.
    await h.api().get(`${API_PREFIX}/wallet`).set(auth(buyer)).expect(200);
    const wallet = await h.prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.userId } });

    await h.prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: opts.balance },
    });

    // Written straight through Prisma on purpose: the API now refuses
    // `enabled: true`, and the case under test is a *legacy* row that was
    // stored before that refusal existed.
    await h.prisma.autoTopupRule.create({
      data: {
        walletId: wallet.id,
        enabled: true,
        trigger: 'below_threshold',
        thresholdAmount: opts.threshold,
        topupAmount: opts.topupAmount,
      },
    });

    return wallet;
  }

  it('does not credit anything when a debit drops the balance below the threshold', async () => {
    // Starting 500, debit 400 → 100, which is below the 200 threshold, so
    // the old code would have credited 5000 and left the balance at 5100.
    const wallet = await seedWalletWithEnabledRule({
      balance: 500,
      threshold: 200,
      topupAmount: 5000,
    });

    await h
      .api()
      .post(`${API_PREFIX}/wallet/adjust`)
      .set(auth(admin))
      .send({ userId: buyer.userId, direction: 'debit', amount: 400, reason: 'e2e debit' })
      .expect(201);

    const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    // Computed by hand: 500 - 400. Not read back from a prior run.
    expect(Number(after.balance)).toBe(100);

    const topups = await h.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, category: 'topup' },
    });
    expect(topups).toHaveLength(0);

    const named = await h.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, title: 'Auto top-up' },
    });
    expect(named).toHaveLength(0);
  });

  it('leaves the debit itself intact and correctly recorded', async () => {
    const wallet = await seedWalletWithEnabledRule({
      balance: 1000,
      threshold: 900,
      topupAmount: 2500,
    });

    await h
      .api()
      .post(`${API_PREFIX}/wallet/adjust`)
      .set(auth(admin))
      .send({ userId: buyer.userId, direction: 'debit', amount: 250, reason: 'e2e debit' })
      .expect(201);

    const rows = await h.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'asc' },
    });

    // Assert on the *kinds* of row rather than the total count. Counting
    // every row on the wallet made this depend on whatever else the
    // harness happens to write for a freshly registered user, which is not
    // what this test is about — and it failed only in a full-suite run,
    // which is the worst way to find that out.
    const credits = rows.filter((r) => r.direction === 'credit');
    const debits = rows.filter((r) => r.direction === 'debit');

    // The one thing that matters: no phantom credit appeared.
    expect(credits).toHaveLength(0);

    const theDebit = debits.find((r) => Number(r.amount) === 250);
    expect(theDebit).toBeDefined();
    // 1000 - 250, and the row's own record of it agrees with the wallet.
    expect(Number(theDebit!.balanceAfter)).toBe(750);
  });

  it('refuses to enable auto top-up over the API', async () => {
    const res = await h
      .api()
      .put(`${API_PREFIX}/wallet/auto-topup`)
      .set(auth(buyer))
      .send({ enabled: true, trigger: 'below-threshold', thresholdAmount: 200, topupAmount: 500 })
      .expect(400);

    expect(errorOf(res).message).toMatch(/paused/i);

    // Nothing was persisted by the rejected call.
    const wallet = await h.prisma.wallet.findUnique({ where: { userId: buyer.userId } });
    if (wallet) {
      const rule = await h.prisma.autoTopupRule.findUnique({ where: { walletId: wallet.id } });
      expect(rule?.enabled ?? false).toBe(false);
    }
  });

  it('still lets someone turn an existing rule off', async () => {
    const wallet = await seedWalletWithEnabledRule({
      balance: 100,
      threshold: 50,
      topupAmount: 500,
    });

    await h
      .api()
      .put(`${API_PREFIX}/wallet/auto-topup`)
      .set(auth(buyer))
      .send({ enabled: false })
      .expect(200);

    const rule = await h.prisma.autoTopupRule.findUniqueOrThrow({
      where: { walletId: wallet.id },
    });
    expect(rule.enabled).toBe(false);
  });

  it('caps the stored amounts so a re-enabled rule cannot be unbounded', async () => {
    await h
      .api()
      .put(`${API_PREFIX}/wallet/auto-topup`)
      .set(auth(buyer))
      .send({ topupAmount: 999999 })
      .expect(400);

    await h
      .api()
      .put(`${API_PREFIX}/wallet/auto-topup`)
      .set(auth(buyer))
      .send({ thresholdAmount: 999999 })
      .expect(400);
  });

  it('reports the feature as inactive to every client, not just the web app', async () => {
    const res = await h
      .api()
      .get(`${API_PREFIX}/wallet/auto-topup`)
      .set(auth(buyer))
      .expect(200);

    // A native client that only read `enabled` would tell people it works.
    expect(res.body.active).toBe(false);
    expect(typeof res.body.unavailableReason).toBe('string');
    expect(res.body.unavailableReason.length).toBeGreaterThan(0);
  });
});
