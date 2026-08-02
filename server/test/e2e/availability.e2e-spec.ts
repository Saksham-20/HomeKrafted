import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  resetDatabase,
} from './harness';

/**
 * Per-kitchen availability — three switches kept deliberately apart:
 * `workingDays` (the weekly pattern), `VendorBlackoutDate` (specific
 * exceptions to it), and `prepTimeMins` (how much notice). Merging any two
 * makes one silently override another.
 *
 * The rule that carries the most risk is the defaulting: **absence is
 * never a closure.** A HomeKrafter who has filled in nothing must keep
 * taking orders exactly as they did before this feature existed, and a
 * missing prep time must read as the platform's 90-minute floor rather
 * than as "instant".
 */
describe('vendor availability', () => {
  let h: Harness;
  let seller: Actor;
  let vendorSlug: string;
  let vendorId: string;

  const iso = (daysFromNow: number) =>
    new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const kitchen = await createKitchen(h);
    vendorSlug = kitchen.vendor.slug;
    vendorId = kitchen.vendor.id;
    seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
  });

  const publicAvailability = () => h.api().get(`${API_PREFIX}/vendors/${vendorSlug}/availability`);

  const addBlackout = (actor: Actor, body: object) =>
    h.api().post(`${API_PREFIX}/seller/profile/blackouts`).set(auth(actor)).send(body);

  describe('a kitchen that has declared nothing', () => {
    it('is open every day, with the platform prep time', async () => {
      const res = await publicAvailability().expect(200);
      expect(res.body.prepTimeMins).toBe(90);
      // Empty, not "closed every day". The picker reads an empty list as
      // every day — that is what stops a silent shutdown.
      expect(res.body.workingDays).toEqual([]);
      expect(res.body.blackouts).toEqual([]);
    });

    it('is readable without signing in, because a buyer picks a slot before checkout', async () => {
      await publicAvailability().expect(200);
    });

    it('404s for a kitchen that does not exist', async () => {
      await h.api().get(`${API_PREFIX}/vendors/no-such-kitchen/availability`).expect(404);
    });
  });

  describe('a declared prep time and pattern', () => {
    it('publishes what the seller set', async () => {
      await h
        .api()
        .patch(`${API_PREFIX}/seller/profile`)
        .set(auth(seller))
        .send({ prepTimeMins: 2880, workingDays: [1, 2, 3, 4, 5], capacityPerDay: 12 })
        .expect(200);

      const res = await publicAvailability().expect(200);
      expect(res.body.prepTimeMins).toBe(2880);
      expect(res.body.workingDays).toEqual([1, 2, 3, 4, 5]);
      expect(res.body.capacityPerDay).toBe(12);
    });

    it('keeps a declared zero prep time rather than defaulting over it', async () => {
      await h
        .api()
        .patch(`${API_PREFIX}/seller/profile`)
        .set(auth(seller))
        .send({ prepTimeMins: 0 })
        .expect(200);
      expect((await publicAvailability().expect(200)).body.prepTimeMins).toBe(0);
    });
  });

  describe('days off', () => {
    it('records a specific date with its reason', async () => {
      await addBlackout(seller, { date: iso(3), reason: 'Closed for Diwali' }).expect(201);
      const res = await publicAvailability().expect(200);
      expect(res.body.blackouts).toEqual([{ date: iso(3), reason: 'Closed for Diwali' }]);
    });

    it('accepts a day off with no reason given', async () => {
      await addBlackout(seller, { date: iso(3) }).expect(201);
      expect((await publicAvailability().expect(200)).body.blackouts[0].date).toBe(iso(3));
    });

    it('treats marking the same day off twice as the same state, not an error', async () => {
      // A double-tap is not a mistake worth an error page, and the second
      // press carries the corrected reason.
      await addBlackout(seller, { date: iso(3), reason: 'Travelling' }).expect(201);
      await addBlackout(seller, { date: iso(3), reason: 'Family wedding' }).expect(201);

      const res = await publicAvailability().expect(200);
      expect(res.body.blackouts).toHaveLength(1);
      expect(res.body.blackouts[0].reason).toBe('Family wedding');
    });

    it('rejects a date that is not YYYY-MM-DD', async () => {
      // A blackout is a whole day. Anything with a time in it means the
      // caller has the wrong model of this feature.
      await addBlackout(seller, { date: '25/12/2026' }).expect(400);
      await addBlackout(seller, { date: '2026-12-25T10:00:00Z' }).expect(400);
      expect(await h.prisma.vendorBlackoutDate.count()).toBe(0);
    });

    it('stores the date without a timezone shifting it', async () => {
      // Stored as `@db.Date` at UTC midnight. A local-time round trip west
      // of UTC would close the previous day instead.
      await addBlackout(seller, { date: '2026-12-25' }).expect(201);
      const row = await h.prisma.vendorBlackoutDate.findFirst();
      expect(row!.date.toISOString().slice(0, 10)).toBe('2026-12-25');
      expect((await publicAvailability().expect(200)).body.blackouts[0].date).toBe('2026-12-25');
    });

    it('hides a past day off from buyers but keeps it for the seller', async () => {
      // History for them, noise for a buyer — and the payload would grow
      // for every year the kitchen stays open.
      await h.prisma.vendorBlackoutDate.create({
        data: { vendorId, date: new Date('2020-01-01T00:00:00.000Z'), reason: 'Long ago' },
      });
      await addBlackout(seller, { date: iso(3), reason: 'Soon' }).expect(201);

      const buyerSees = await publicAvailability().expect(200);
      expect(buyerSees.body.blackouts).toHaveLength(1);
      expect(buyerSees.body.blackouts[0].reason).toBe('Soon');

      const sellerSees = await h
        .api()
        .get(`${API_PREFIX}/seller/profile/blackouts`)
        .set(auth(seller))
        .expect(200);
      expect(sellerSees.body).toHaveLength(2);
    });

    it('can be cancelled by the kitchen that set it', async () => {
      await addBlackout(seller, { date: iso(3) }).expect(201);
      const row = await h.prisma.vendorBlackoutDate.findFirst();
      await h
        .api()
        .delete(`${API_PREFIX}/seller/profile/blackouts/${row!.id}`)
        .set(auth(seller))
        .expect(200);
      expect((await publicAvailability().expect(200)).body.blackouts).toEqual([]);
    });

    it('refuses a consumer and an anonymous caller', async () => {
      const buyer = await createActor(h);
      await addBlackout(buyer, { date: iso(3) }).expect(403);
      await h.api().post(`${API_PREFIX}/seller/profile/blackouts`).send({ date: iso(3) }).expect(401);
    });
  });

  describe('the three switches stay separate', () => {
    it('a day off does not change the weekly pattern', async () => {
      await h
        .api()
        .patch(`${API_PREFIX}/seller/profile`)
        .set(auth(seller))
        .send({ workingDays: [1, 2, 3, 4, 5] })
        .expect(200);
      await addBlackout(seller, { date: iso(3), reason: 'Travelling' }).expect(201);

      const res = await publicAvailability().expect(200);
      // Both present and independent: merging them would make "am I open
      // on the 14th" answerable two different ways.
      expect(res.body.workingDays).toEqual([1, 2, 3, 4, 5]);
      expect(res.body.blackouts).toHaveLength(1);
    });

    it('availability says nothing about whether an item is being made', async () => {
      // `Product.isAvailable` and `moderationStatus` are different
      // switches on purpose, and this payload carries neither.
      const res = await publicAvailability().expect(200);
      expect(res.body).not.toHaveProperty('isAvailable');
      expect(res.body).not.toHaveProperty('moderationStatus');
    });
  });
});
