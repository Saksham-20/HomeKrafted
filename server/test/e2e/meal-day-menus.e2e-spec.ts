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
 * Dated menus + the menu lock (M37).
 *
 * The product rules under test: a kitchen sets what a specific date
 * serves; a 7-line `weeklyMenu` reads Monday→Sunday as the fallback; a
 * date locks at `menuLockTime` IST the evening before, after which only
 * the audited admin override may change it; and a *change* to a set date
 * notifies the subscribers scheduled for it, while a first-time set
 * notifies nobody (planning is not a change).
 */
describe('meal plan day menus', () => {
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

  const iso = (daysFromToday: number) => {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    day.setUTCDate(day.getUTCDate() + daysFromToday);
    return day.toISOString().slice(0, 10);
  };

  async function kitchenWithPlan(weeklyMenu: string[] = []) {
    const { vendor, seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const plan = await h.prisma.mealPlan.create({
      data: {
        slug: `daymenu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        vendorId: vendor.id,
        sellerId: seller.id,
        name: 'Weekday Thali',
        description: 'Dal, sabzi, rotis.',
        mealType: 'lunch',
        diet: 'veg',
        pricePerMeal: 120,
        imagePlaceholder: 'lunch',
        moderationStatus: 'active',
        weeklyMenu,
      },
    });
    return { vendor, seller, sellerActor, plan };
  }

  async function subscriber(planId: string, bracketStart = '12:30') {
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await h.api().get(`${API_PREFIX}/wallet`).set(auth(buyer)).expect(200);
    const wallet = await h.prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.userId } });
    await h.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 10_000 } });
    const res = await h
      .api()
      .post(`${API_PREFIX}/meal-subscriptions`)
      .set(auth(buyer))
      .send({
        planId,
        addressId: address.id,
        bracketStart,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        mealCount: 6,
      })
      .expect(201);
    return { buyer, subscription: res.body };
  }

  const putMenu = (actor: Actor, planId: string, date: string, lines: string[]) =>
    h
      .api()
      .put(`${API_PREFIX}/seller/meal-plans/${planId}/menus/${date}`)
      .set(auth(actor))
      .send({ lines });

  const setLockTime = async (value: string) => {
    const admin = await createActor(h, 'admin');
    await h
      .api()
      .patch(`${API_PREFIX}/admin/settings`)
      .set(auth(admin))
      .send({ menuLockTime: value })
      .expect(200);
    return admin;
  };

  it('round-trips a set day, and the range names its source per date', async () => {
    const { sellerActor, plan } = await kitchenWithPlan([
      'Mon: rajma',
      'Tue: kadhi',
      'Wed: chole',
      'Thu: bhindi',
      'Fri: paneer',
      'Sat: aloo gobi',
      'Sun: biryani',
    ]);

    const target = iso(3);
    const put = await putMenu(sellerActor, plan.id, target, ['Chole bhature', 'Salad']).expect(200);
    expect(put.body.source).toBe('day');
    expect(put.body.lines).toEqual(['Chole bhature', 'Salad']);

    const range = await h
      .api()
      .get(`${API_PREFIX}/seller/meal-plans/${plan.id}/menus?days=7`)
      .set(auth(sellerActor))
      .expect(200);

    expect(range.body.lockTime).toBe('20:00');
    const byDate = new Map(
      (range.body.days as { date: string; source: string; lines: string[] }[]).map((d) => [
        d.date,
        d,
      ]),
    );
    expect(byDate.get(target)?.source).toBe('day');
    expect(byDate.get(target)?.lines).toEqual(['Chole bhature', 'Salad']);
    // Every other date falls back to the 7-line rotation.
    expect(byDate.get(iso(2))?.source).toBe('template');
    expect(byDate.get(iso(2))?.lines).toHaveLength(1);
  });

  it('a rotation that is not exactly 7 lines opts out of the weekday fallback', async () => {
    const { sellerActor, plan } = await kitchenWithPlan(['Whatever the market had', 'Some dal']);
    const range = await h
      .api()
      .get(`${API_PREFIX}/seller/meal-plans/${plan.id}/menus?days=3`)
      .set(auth(sellerActor))
      .expect(200);
    for (const day of range.body.days as { source: string }[]) {
      expect(day.source).toBe('none');
    }
  });

  it('clearing with [] returns the date to the rotation', async () => {
    const { sellerActor, plan } = await kitchenWithPlan();
    const target = iso(4);
    await putMenu(sellerActor, plan.id, target, ['One-off special']).expect(200);
    const cleared = await putMenu(sellerActor, plan.id, target, []).expect(200);
    expect(cleared.body.source).toBe('none');
    expect(await h.prisma.mealPlanDayMenu.count({ where: { planId: plan.id } })).toBe(0);
  });

  it('refuses a locked date for the kitchen, naming the lock time', async () => {
    // '00:00' locks every date at midnight IST the evening before —
    // tomorrow has been locked since yesterday evening, whatever the
    // clock says now (no midnight-flake window).
    await setLockTime('00:00');
    const { sellerActor, plan } = await kitchenWithPlan();

    const refused = await putMenu(sellerActor, plan.id, iso(1), ['Too late']).expect(400);
    expect(refused.body.error.message).toContain('00:00');
    expect(refused.body.error.message).toContain('evening before');
  });

  it('the admin override moves a locked date, audits it, and tells scheduled subscribers', async () => {
    const admin = await setLockTime('00:00');
    const { sellerActor, plan } = await kitchenWithPlan();

    // Set the menu while unlocked (default first): use a far date under
    // the seller, then flip the lock — no: lock is already '00:00'.
    // Seed the existing row directly, as an earlier unlocked write would
    // have left it.
    const targetIso = iso(1);
    const target = new Date(`${targetIso}T00:00:00.000Z`);
    await h.prisma.mealPlanDayMenu.create({
      data: { planId: plan.id, date: target, lines: ['Rajma chawal'] },
    });

    const { buyer } = await subscriber(plan.id);
    const scheduled = await h.prisma.mealDelivery.findFirst({
      where: { subscription: { planId: plan.id }, scheduledFor: target },
    });
    // The cycle starts tomorrow at the earliest, so the target date has a
    // scheduled delivery to be affected.
    expect(scheduled).not.toBeNull();

    // The seller is still refused…
    await putMenu(sellerActor, plan.id, targetIso, ['Emergency change']).expect(400);

    // …the admin is not.
    const overridden = await h
      .api()
      .put(`${API_PREFIX}/admin/catalog/meal-plans/${plan.id}/menus/${targetIso}`)
      .set(auth(admin))
      .send({ lines: ['Khichdi (kitchen emergency)'] })
      .expect(200);
    expect(overridden.body.lines).toEqual(['Khichdi (kitchen emergency)']);

    const audit = await h.prisma.adminAuditLog.findFirst({
      where: { action: 'meal_plan.menu_override', targetId: plan.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit!.metadata)).toContain('Rajma chawal');
    expect(JSON.stringify(audit!.metadata)).toContain('Khichdi');

    // The change reached the subscriber on the meals category.
    const rows = await h.prisma.notification.findMany({
      where: { userId: buyer.userId, category: 'meals', title: { contains: 'Menu changed' } },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].body).toContain('Khichdi');
  });

  it('first-time setting a date notifies nobody — planning is not a change', async () => {
    const { sellerActor, plan } = await kitchenWithPlan();
    const { buyer } = await subscriber(plan.id);

    await putMenu(sellerActor, plan.id, iso(3), ['Paneer bhurji']).expect(200);

    const rows = await h.prisma.notification.findMany({
      where: { userId: buyer.userId, category: 'meals', title: { contains: 'Menu changed' } },
    });
    expect(rows).toHaveLength(0);
  });

  it("another kitchen's plan 404s — never confirmed to exist", async () => {
    const { plan } = await kitchenWithPlan();
    const { sellerActor: other } = await kitchenWithPlan();
    await putMenu(other, plan.id, iso(2), ['Not mine']).expect(404);
    await h
      .api()
      .get(`${API_PREFIX}/seller/meal-plans/${plan.id}/menus`)
      .set(auth(other))
      .expect(404);
  });

  it('the public plan detail carries thisWeek only when day menus exist', async () => {
    const { sellerActor, plan } = await kitchenWithPlan();

    const before = await h.api().get(`${API_PREFIX}/meal-plans/${plan.slug}`).expect(200);
    expect(before.body.thisWeek).toBeUndefined();

    await putMenu(sellerActor, plan.id, iso(2), ['Chole bhature']).expect(200);

    const after = await h.api().get(`${API_PREFIX}/meal-plans/${plan.slug}`).expect(200);
    expect(after.body.thisWeek).toEqual([{ date: iso(2), lines: ['Chole bhature'] }]);
  });
});
