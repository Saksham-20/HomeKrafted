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
 * A kitchen's day off reaches the meals already sold for it (M37).
 *
 * Before this, `VendorBlackoutDate` was consulted only when a schedule
 * was *generated* — a blackout added after somebody subscribed touched
 * nothing, the delivery stayed `scheduled`, and the kitchen didn't cook.
 * `MealDeliveryStatus.unavailable` existed since M19 with no writer;
 * the cascade is its first.
 *
 * The promise mirrors skip: owed, not lost — the affected meal moves to
 * the end of the cycle on the buyer's own days, and the subscriber is
 * told on the `meals` category.
 */
describe('vendor blackout cascade onto meal deliveries', () => {
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

  async function kitchenWithSubscriber() {
    const { vendor, seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const plan = await h.prisma.mealPlan.create({
      data: {
        slug: `blackout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        vendorId: vendor.id,
        sellerId: seller.id,
        name: 'Ghar Ki Rasoi',
        description: 'Rotis, dal, one sabzi.',
        mealType: 'lunch',
        diet: 'veg',
        pricePerMeal: 110,
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
    return { vendor, sellerActor, buyer, subscriptionId: created.body.id as string, deliveries };
  }

  it('marks the day unavailable with the reason, extends the cycle, and tells the subscriber', async () => {
    const { sellerActor, buyer, subscriptionId, deliveries } = await kitchenWithSubscriber();
    const target = deliveries[2];
    const targetIso = target.scheduledFor.toISOString().slice(0, 10);
    const oldEnd = (
      await h.prisma.mealSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })
    ).endDate;

    await h
      .api()
      .post(`${API_PREFIX}/seller/profile/blackouts`)
      .set(auth(sellerActor))
      .send({ date: targetIso, reason: 'Diwali at home' })
      .expect(201);

    // The recorded fact: unavailable, with the kitchen's reason.
    const row = await h.prisma.mealDelivery.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.status).toBe('unavailable');
    expect(row.reason).toBe('Diwali at home');

    // Owed, not lost: a replacement exists past the old end, and the
    // subscription's end moved with it.
    const sub = await h.prisma.mealSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(sub.endDate.getTime()).toBeGreaterThan(oldEnd.getTime());
    const scheduledCount = await h.prisma.mealDelivery.count({
      where: { subscriptionId, status: 'scheduled' },
    });
    expect(scheduledCount).toBe(deliveries.length - 1 + 1);

    // The replacement can never land on the blacked-out date itself.
    const onBlackout = await h.prisma.mealDelivery.count({
      where: { subscriptionId, status: 'scheduled', scheduledFor: target.scheduledFor },
    });
    expect(onBlackout).toBe(0);

    // And the subscriber was told, on the meals category.
    const note = await h.prisma.notification.findFirst({
      where: { userId: buyer.userId, category: 'meals', title: { contains: 'closed' } },
    });
    expect(note).not.toBeNull();
    expect(note!.body).toContain('owed, not lost');
  });

  it('a blackout on a date with no deliveries cascades onto nothing', async () => {
    const { sellerActor, subscriptionId, deliveries } = await kitchenWithSubscriber();
    const wellPast = new Date(deliveries[deliveries.length - 1].scheduledFor);
    wellPast.setUTCDate(wellPast.getUTCDate() + 30);

    await h
      .api()
      .post(`${API_PREFIX}/seller/profile/blackouts`)
      .set(auth(sellerActor))
      .send({ date: wellPast.toISOString().slice(0, 10) })
      .expect(201);

    const statuses = await h.prisma.mealDelivery.findMany({
      where: { subscriptionId },
      select: { status: true },
    });
    expect(statuses.every((s) => s.status === 'scheduled')).toBe(true);
  });

  it('removing the blackout does not un-mark the day — recorded facts stay', async () => {
    const { sellerActor, subscriptionId, deliveries } = await kitchenWithSubscriber();
    const target = deliveries[1];
    const targetIso = target.scheduledFor.toISOString().slice(0, 10);

    const added = await h
      .api()
      .post(`${API_PREFIX}/seller/profile/blackouts`)
      .set(auth(sellerActor))
      .send({ date: targetIso })
      .expect(201);
    const blackoutId = (added.body as { id: string; date: string }[]).find(
      (b) => b.date === targetIso,
    )!.id;

    await h
      .api()
      .delete(`${API_PREFIX}/seller/profile/blackouts/${blackoutId}`)
      .set(auth(sellerActor))
      .expect(200);

    const row = await h.prisma.mealDelivery.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.status).toBe('unavailable');
    // The replacement is already owed; re-opening the day changes nothing
    // for a schedule that was already rewritten around it.
    const scheduledCount = await h.prisma.mealDelivery.count({
      where: { subscriptionId, status: 'scheduled' },
    });
    expect(scheduledCount).toBe(deliveries.length);
  });
});
