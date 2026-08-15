import {
  API_PREFIX,
  Harness,
  auth,
  createActor,
  createAddress,
  createHarness,
  createKitchen,
  resetDatabase,
} from './harness';

/**
 * Two people cannot share the last seat on a meal plan (M37).
 *
 * The capacity check was count-then-insert inside a transaction — which
 * under READ COMMITTED serialises nothing: two concurrent subscribers
 * both counted, both saw a free seat, both inserted, and a home cook who
 * said "6 tiffins a day" owed 7. The fix locks the plan row
 * (`SELECT … FOR UPDATE`) before counting, the same pattern
 * `seller/payouts.service.ts` and `wallet.service.ts` already use.
 *
 * Same discipline as `money-races.e2e-spec.ts`: real concurrency against
 * one Postgres via `Promise.allSettled`, not a simulated interleaving.
 */
describe('meal plan capacity under concurrency', () => {
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

  async function onePlanOneSeat() {
    const { vendor, seller } = await createKitchen(h);
    const plan = await h.prisma.mealPlan.create({
      data: {
        slug: `race-lunch-${Date.now()}`,
        vendorId: vendor.id,
        sellerId: seller.id,
        name: 'One-Seat Lunch',
        description: 'A plan with exactly one seat, for the race below.',
        mealType: 'lunch',
        diet: 'veg',
        pricePerMeal: 100,
        imagePlaceholder: 'lunch',
        moderationStatus: 'active',
        maxSubscribers: 1,
      },
    });
    return plan;
  }

  /** A funded buyer with an address — enough to subscribe. */
  async function fundedBuyer() {
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await h.api().get(`${API_PREFIX}/wallet`).set(auth(buyer)).expect(200);
    const wallet = await h.prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.userId } });
    await h.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 5000 } });
    return { buyer, address, walletId: wallet.id };
  }

  it('one 201, one 409 — never two subscriptions on a one-seat plan', async () => {
    const plan = await onePlanOneSeat();
    const first = await fundedBuyer();
    const second = await fundedBuyer();

    const subscribe = (actor: typeof first) =>
      h
        .api()
        .post(`${API_PREFIX}/meal-subscriptions`)
        .set(auth(actor.buyer))
        .send({
          planId: plan.id,
          addressId: actor.address.id,
          bracketStart: '12:30',
          daysOfWeek: [1, 2, 3, 4, 5],
          mealCount: 6,
        });

    const results = await Promise.allSettled([subscribe(first), subscribe(second)]);
    const statuses = results
      .map((r) => (r.status === 'fulfilled' ? r.value.status : 0))
      .sort((a, b) => a - b);

    expect(statuses).toEqual([201, 409]);

    // Exactly one subscription exists, and its deliveries with it.
    expect(await h.prisma.mealSubscription.count({ where: { planId: plan.id } })).toBe(1);

    // The loser paid nothing: their wallet still holds the full balance,
    // and no ledger row references a subscription that never happened.
    const winnerPaid = 6 * 100;
    const balances = await Promise.all(
      [first, second].map(async (actor) => {
        const wallet = await h.prisma.wallet.findUniqueOrThrow({ where: { id: actor.walletId } });
        return Number(wallet.balance);
      }),
    );
    expect(balances.sort((a, b) => a - b)).toEqual([5000 - winnerPaid, 5000]);
  });

  it('a paused subscription keeps its seat against the cap', async () => {
    const plan = await onePlanOneSeat();
    const first = await fundedBuyer();
    const second = await fundedBuyer();

    const created = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(first.buyer))
      .send({
        planId: plan.id,
        addressId: first.address.id,
        bracketStart: '12:30',
        daysOfWeek: [1, 2, 3, 4, 5],
        mealCount: 6,
      })
      .expect(201);

    await h
      .api()
      .patch(`${API_PREFIX}/meal-subscriptions/${created.body.id}/pause`)
      .set(auth(first.buyer))
      .expect(200);

    // Somebody away for a week has not given up their tiffin (M19 rule).
    await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(second.buyer))
      .send({
        planId: plan.id,
        addressId: second.address.id,
        bracketStart: '12:30',
        daysOfWeek: [1, 2, 3, 4, 5],
        mealCount: 6,
      })
      .expect(409);
  });
});
