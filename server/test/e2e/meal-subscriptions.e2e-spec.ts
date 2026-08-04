import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createAddress,
  createHarness,
  createKitchen,
  errorOf,
  resetDatabase,
} from './harness';

/**
 * Meal subscriptions are the platform's first recurring product, and the
 * milestone they ship in opened by deleting a code path that credited wallet
 * balance nobody paid for. So the rules worth guarding here are all money
 * rules and all enforced by a query:
 *
 * - a cycle is paid for **in full, up front**, and the whole thing rolls
 *   back if the wallet cannot cover it;
 * - the price is **snapshotted**, so a kitchen raising its price cannot
 *   change what somebody already agreed to pay;
 * - a kitchen's stated capacity actually holds;
 * - cancelling **moves no money** — that is an admin decision, exactly as
 *   M15 decided for returns.
 *
 * Prisma is never mocked here. Every one of those is a database constraint
 * or a transaction boundary, and a mocked one would test the mock.
 */
describe('Meal subscriptions', () => {
  let h: Harness;
  let buyer: Actor;
  let addressId: string;
  let planId: string;
  let vendorId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    buyer = await createActor(h, 'consumer');
    const address = await createAddress(h, buyer.userId);
    addressId = address.id;

    const { vendor, seller } = await createKitchen(h);
    vendorId = vendor.id;

    const plan = await h.prisma.mealPlan.create({
      data: {
        slug: `lunch-${Date.now()}`,
        vendorId: vendor.id,
        sellerId: seller.id,
        name: 'Everyday Ghar Ka Khana',
        description: '2 rotis, dal, sabzi, rice and salad.',
        mealType: 'lunch',
        diet: 'veg',
        pricePerMeal: 120,
        imagePlaceholder: 'lunch',
      },
    });
    planId = plan.id;
  });

  /** Puts a known balance on the buyer's wallet. */
  async function fundWallet(amount: number) {
    await h.api().get(`${API_PREFIX}/wallet`).set(auth(buyer)).expect(200);
    const wallet = await h.prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.userId } });
    await h.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: amount } });
    return wallet;
  }

  const subscribeBody = (overrides: Record<string, unknown> = {}) => ({
    planId,
    addressId,
    bracketStart: '12:30',
    daysOfWeek: [1, 2, 3, 4, 5],
    mealCount: 6,
    ...overrides,
  });

  it('debits the whole cycle up front and schedules one delivery per meal', async () => {
    const wallet = await fundWallet(2000);

    const res = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(201);

    // 6 meals × ₹120, computed by hand.
    expect(res.body.amountPaid).toBe(720);
    expect(res.body.mealsTotal).toBe(6);
    expect(res.body.mealsRemaining).toBe(6);
    expect(res.body.deliveries).toHaveLength(6);

    const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    // 2000 - 720.
    expect(Number(after.balance)).toBe(1280);

    const ledger = await h.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, refType: 'mealSubscription' },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].direction).toBe('debit');
    expect(Number(ledger[0].amount)).toBe(720);
    expect(ledger[0].refId).toBe(res.body.id);
  });

  it('rolls the whole subscription back when the wallet cannot cover it', async () => {
    await fundWallet(100);

    await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(402);

    // The load-bearing assertion: no orphaned subscription, and no
    // deliveries scheduled that nobody paid for.
    expect(await h.prisma.mealSubscription.count()).toBe(0);
    expect(await h.prisma.mealDelivery.count()).toBe(0);
  });

  it('snapshots the price, so a later rise does not change what was agreed', async () => {
    await fundWallet(5000);

    const res = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(201);

    await h.prisma.mealPlan.update({ where: { id: planId }, data: { pricePerMeal: 200 } });

    const after = await h
      .api()
      .get(`${API_PREFIX}/meal-subscriptions/${res.body.id}`)
      .set(auth(buyer))
      .expect(200);

    // Still the agreed 120, not the plan's new 200.
    expect(after.body.pricePerMeal).toBe(120);
    expect(after.body.amountPaid).toBe(720);
  });

  it('enforces the kitchen capacity it states', async () => {
    await h.prisma.mealPlan.update({ where: { id: planId }, data: { maxSubscribers: 1 } });
    await fundWallet(5000);

    await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(201);

    const second = await createActor(h, 'consumer');
    const secondAddress = await createAddress(h, second.userId);
    await h.api().get(`${API_PREFIX}/wallet`).set(auth(second)).expect(200);
    const secondWallet = await h.prisma.wallet.findUniqueOrThrow({ where: { userId: second.userId } });
    await h.prisma.wallet.update({ where: { id: secondWallet.id }, data: { balance: 5000 } });

    const res = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(second))
      .send({ ...subscribeBody(), addressId: secondAddress.id })
      .expect(409);

    expect(errorOf(res).message).toMatch(/full/i);
    // And the refused subscriber was charged nothing.
    const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: secondWallet.id } });
    expect(Number(after.balance)).toBe(5000);
  });

  it('refuses a delivery window the kitchen does not offer', async () => {
    await fundWallet(5000);

    // 20:00 is dinner. This is a lunch plan.
    const res = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody({ bracketStart: '20:00' }))
      .expect(400);

    expect(errorOf(res).message).toMatch(/does not deliver/i);
    expect(await h.prisma.mealSubscription.count()).toBe(0);
  });

  it('refuses an address belonging to somebody else', async () => {
    await fundWallet(5000);
    const stranger = await createActor(h, 'consumer');
    const strangerAddress = await createAddress(h, stranger.userId);

    await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody({ addressId: strangerAddress.id }))
      .expect(404);

    expect(await h.prisma.mealSubscription.count()).toBe(0);
  });

  it('skips a meal by owing it, not by losing it', async () => {
    await fundWallet(5000);

    const created = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(201);

    const firstDelivery = created.body.deliveries[0];
    const originalEnd = created.body.endDate;

    await h
      .api()
      .patch(`${API_PREFIX}/meal-subscriptions/${created.body.id}/deliveries/${firstDelivery.id}/skip`)
      .set(auth(buyer))
      .expect(200);

    const after = await h
      .api()
      .get(`${API_PREFIX}/meal-subscriptions/${created.body.id}`)
      .set(auth(buyer))
      .expect(200);

    const skipped = after.body.deliveries.find((d: { id: string }) => d.id === firstDelivery.id);
    expect(skipped.status).toBe('skipped');

    // The meal is owed, so the cycle grew a day at the far end and the
    // buyer still has six scheduled meals plus the one they skipped.
    expect(after.body.endDate > originalEnd).toBe(true);
    const stillComing = after.body.deliveries.filter(
      (d: { status: string }) => d.status === 'scheduled',
    );
    expect(stillComing).toHaveLength(6);
  });

  it('cancels without moving any money', async () => {
    const wallet = await fundWallet(2000);

    const created = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(201);

    await h
      .api()
      .delete(`${API_PREFIX}/meal-subscriptions/${created.body.id}`)
      .set(auth(buyer))
      .expect(200);

    // Balance is unchanged from the post-purchase 1280. An automatic refund
    // would make the most abusable path the most frictionless, and the loss
    // would land on a home cook who already bought the ingredients.
    const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect(Number(after.balance)).toBe(1280);

    const credits = await h.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, direction: 'credit' },
    });
    expect(credits).toHaveLength(0);

    // And nothing is still scheduled to be cooked.
    const stillScheduled = await h.prisma.mealDelivery.count({
      where: { subscriptionId: created.body.id, status: 'scheduled' },
    });
    expect(stillScheduled).toBe(0);
  });

  it('does not let one buyer read or act on another buyer subscription', async () => {
    await fundWallet(5000);
    const created = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(201);

    const stranger = await createActor(h, 'consumer');

    // 404, not 403 — a stranger's id should not be confirmable by the error.
    await h
      .api()
      .get(`${API_PREFIX}/meal-subscriptions/${created.body.id}`)
      .set(auth(stranger))
      .expect(404);

    await h
      .api()
      .delete(`${API_PREFIX}/meal-subscriptions/${created.body.id}`)
      .set(auth(stranger))
      .expect(404);

    const still = await h.prisma.mealSubscription.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(still.status).toBe('active');
  });

  it('charges once when the same idempotency key is retried', async () => {
    const wallet = await fundWallet(2000);
    const key = `meal-${Date.now()}`;

    const first = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .set('Idempotency-Key', key)
      .send(subscribeBody())
      .expect(201);

    await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .set('Idempotency-Key', key)
      .send(subscribeBody())
      .expect(201);

    expect(await h.prisma.mealSubscription.count()).toBe(1);
    const after = await h.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    // Debited 720 exactly once.
    expect(Number(after.balance)).toBe(1280);
    expect(first.body.id).toBeDefined();
  });

  it('hides a plan the admin has moderated, without saying it exists', async () => {
    await h.prisma.mealPlan.update({
      where: { id: planId },
      data: { moderationStatus: 'hidden' },
    });

    const plan = await h.prisma.mealPlan.findUniqueOrThrow({ where: { id: planId } });
    await h.api().get(`${API_PREFIX}/meal-plans/${plan.slug}`).expect(404);

    const list = await h.api().get(`${API_PREFIX}/meal-plans`).expect(200);
    expect(list.body.find((p: { id: string }) => p.id === planId)).toBeUndefined();

    // And it cannot be subscribed to by id either — hiding it in the list
    // while leaving the write path open would be the usual half-fix.
    await fundWallet(5000);
    await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send(subscribeBody())
      .expect(404);
  });

  it('lists plans anonymously, because browsing is never behind a login', async () => {
    const res = await h.api().get(`${API_PREFIX}/meal-plans`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].vendorId).toBe(vendorId);
    // The brackets the kitchen offers ride along, so a client never has to
    // re-derive them and disagree with the server.
    expect(res.body[0].brackets).toContain('12:30');
    expect(res.body[0].brackets).not.toContain('20:00');
  });
});
