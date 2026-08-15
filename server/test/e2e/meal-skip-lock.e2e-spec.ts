import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createAddress,
  createHarness,
  createKitchen,
  resetDatabase,
} from './harness';

/**
 * The menu lock, from the buyer's side (M37).
 *
 * The same instant that freezes the kitchen's menu freezes the buyer's
 * skip: after `menuLockTime` the evening before, that meal is being
 * planned and possibly cooked, so a skip is refused with the reason —
 * and a pause leaves the locked rows `scheduled` (they still arrive)
 * while cancelling everything unlocked.
 *
 * Lock times are chosen so the assertions cannot flake around midnight
 * IST: '00:00' makes tomorrow locked *since yesterday evening* whatever
 * the wall clock says now, and a date 3+ days out is unlocked under any
 * lock time because its lock instant is at least two days away.
 */
describe('meal skip + pause under the menu lock', () => {
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

  const setLockTime = async (value: string) => {
    const admin = await createActor(h, 'admin');
    await h
      .api()
      .patch(`${API_PREFIX}/admin/settings`)
      .set(auth(admin))
      .send({ menuLockTime: value })
      .expect(200);
  };

  async function subscribedBuyer() {
    const { vendor, seller } = await createKitchen(h);
    const plan = await h.prisma.mealPlan.create({
      data: {
        slug: `skiplock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        vendorId: vendor.id,
        sellerId: seller.id,
        name: 'Daily Dal Chawal',
        description: 'Dal, rice, salad.',
        mealType: 'lunch',
        diet: 'veg',
        pricePerMeal: 100,
        imagePlaceholder: 'lunch',
        moderationStatus: 'active',
      },
    });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await h.api().get(`${API_PREFIX}/wallet`).set(auth(buyer)).expect(200);
    const wallet = await h.prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.userId } });
    await h.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 10_000 } });

    const created = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send({
        planId: plan.id,
        addressId: address.id,
        bracketStart: '12:30',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        mealCount: 6,
      })
      .expect(201);

    const deliveries = await h.prisma.mealDelivery.findMany({
      where: { subscriptionId: created.body.id },
      orderBy: { scheduledFor: 'asc' },
    });
    return { buyer, subscriptionId: created.body.id as string, deliveries };
  }

  const skip = (buyer: Actor, subscriptionId: string, deliveryId: string) =>
    h
      .api()
      .patch(`${API_PREFIX}/meal-subscriptions/${subscriptionId}/deliveries/${deliveryId}/skip`)
      .set(auth(buyer));

  it('refuses to skip a locked meal, and says it will still be delivered', async () => {
    await setLockTime('00:00'); // everything through tomorrow locked since yesterday evening
    const { buyer, subscriptionId, deliveries } = await subscribedBuyer();

    const first = deliveries[0]; // earliest — tomorrow at the earliest, locked at '00:00'
    const refused = await skip(buyer, subscriptionId, first.id).expect(409);
    expect(refused.body.error.message).toContain('00:00');
    expect(refused.body.error.message).toContain('still be delivered');

    const row = await h.prisma.mealDelivery.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.status).toBe('scheduled');
  });

  it('a meal 3+ days out skips normally under the same lock', async () => {
    await setLockTime('23:59');
    const { buyer, subscriptionId, deliveries } = await subscribedBuyer();

    const farOut = deliveries[3]; // daily cycle → at least 3 days away
    await skip(buyer, subscriptionId, farOut.id).expect(200);

    const row = await h.prisma.mealDelivery.findUniqueOrThrow({ where: { id: farOut.id } });
    expect(row.status).toBe('skipped');

    // Owed, not lost: the cycle grew a day at the far end.
    const count = await h.prisma.mealDelivery.count({
      where: { subscriptionId, status: 'scheduled' },
    });
    expect(count).toBe(deliveries.length - 1 + 1);
  });

  it('the buyer payload carries locked booleans, computed server-side', async () => {
    await setLockTime('00:00');
    const { buyer, subscriptionId } = await subscribedBuyer();

    const res = await h
      .api()
      .get(`${API_PREFIX}/meal-subscriptions/${subscriptionId}`)
      .set(auth(buyer))
      .expect(200);

    const deliveries = res.body.deliveries as { scheduledFor: string; locked: boolean }[];
    expect(deliveries[0].locked).toBe(true); // tomorrow — locked since yesterday
    expect(deliveries[deliveries.length - 1].locked).toBe(false); // ~6 days out
  });

  it('pause cancels only unlocked meals; a locked one stays scheduled and still arrives', async () => {
    await setLockTime('00:00');
    const { buyer, subscriptionId, deliveries } = await subscribedBuyer();

    await h
      .api()
      .patch(`${API_PREFIX}/meal-subscriptions/${subscriptionId}/pause`)
      .set(auth(buyer))
      .expect(200);

    const rows = await h.prisma.mealDelivery.findMany({
      where: { subscriptionId },
      orderBy: { scheduledFor: 'asc' },
    });
    // Tomorrow's meal was already being planned — it survives the pause.
    expect(rows[0].status).toBe('scheduled');
    // Everything after it stopped.
    for (const row of rows.slice(1)) {
      expect(row.status).toBe('cancelled');
    }
    expect(rows).toHaveLength(deliveries.length);

    // And the pause message said so, on the meals category.
    const note = await h.prisma.notification.findFirst({
      where: { userId: buyer.userId, category: 'meals', title: 'Meal plan paused' },
    });
    expect(note).not.toBeNull();
    expect(note!.body).toContain('still arrive');
  });
});
