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
 * An application whose area cannot be resolved must not become a kitchen.
 *
 * `approveApplication` used to fall back to `TRICITY_CENTRE` whenever
 * `areaById()` missed. That planted the vendor at Chandigarh's exact
 * centre — so an out-of-area kitchen sorted as ~0 km from every buyer in
 * the tricity and passed every delivery-radius filter. A discovery bug
 * wearing a fallback's clothes.
 *
 * The guard is on **resolvability**, not on the literal string `'other'`,
 * and these tests assert that distinction directly: a legacy row carrying
 * an area id that no longer exists in `TRICITY_AREAS` must be refused the
 * same way a brand-new `'other'` application is. Checking only for
 * `'other'` would leave the centroid path live for exactly the rows nobody
 * remembers writing.
 */
describe('Seller application — unresolvable areas are unapprovable', () => {
  let h: Harness;
  let admin: Actor;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    admin = await createActor(h, 'admin');
  });

  const application = (over: Record<string, unknown> = {}) => ({
    businessName: 'Ludhiana Ghar Ka Khana',
    contactName: 'Simran Kaur',
    email: `applicant-${Date.now()}@example.test`,
    phone: '9800000001',
    category: 'home_chef',
    specialties: ['homemade_food'],
    city: 'Ludhiana',
    area: 'other',
    areaLabel: 'Model Town, Ludhiana',
    description: 'Punjabi thali cooked at home.',
    ...over,
  });

  /**
   * Real HTTP intake. Use only where the **endpoint** is under test.
   *
   * `POST /seller-applications` carries its own
   * `@Throttle({ limit: 5, ttl: 60_000 })`, which `test/e2e/env.ts`'s
   * raised global budgets do not override — so a spec that submits through
   * HTTP more than five times starts 429ing partway and fails for a reason
   * that has nothing to do with what it is asserting. That throttle is
   * real, wanted behaviour on a public endpoint; the fix is for setup to
   * stop going through the front door, not to weaken it.
   */
  async function submitHttp(body: Record<string, unknown>) {
    const res = await h
      .api()
      .post(`${API_PREFIX}/seller-applications`)
      .send(body)
      .expect(201);
    return res.body.id as string;
  }

  /** Setup path: the same row the intake would have written, without spending throttle budget. */
  async function seed(over: Record<string, unknown> = {}) {
    const body = { ...application(), ...over } as Record<string, unknown>;
    const row = await h.prisma.sellerApplication.create({
      data: {
        businessName: body.businessName as string,
        contactName: body.contactName as string,
        email: body.email as string,
        phone: body.phone as string,
        category: body.category as 'home_chef',
        specialties: body.specialties as ['homemade_food'],
        city: body.city as string,
        area: body.area as string,
        areaLabel: (body.areaLabel as string | undefined) ?? null,
        deliveryRadiusKm: (body.deliveryRadiusKm as number | undefined) ?? null,
        description: body.description as string,
        status: body.area === 'other' ? 'waitlisted' : 'new',
      },
    });
    return row.id;
  }

  it('accepts an out-of-area applicant and files them as waitlisted', async () => {
    const id = await submitHttp(application());

    const row = await h.prisma.sellerApplication.findUniqueOrThrow({ where: { id } });
    expect(row.area).toBe('other');
    expect(row.areaLabel).toBe('Model Town, Ludhiana');
    // Waitlisted, not `new`: it cannot be approved as-is, so it must not
    // sit in the queue looking like ordinary pending work.
    expect(row.status).toBe('waitlisted');
  });

  it('requires areaLabel when the area is "other"', async () => {
    await h
      .api()
      .post(`${API_PREFIX}/seller-applications`)
      .send(application({ areaLabel: undefined }))
      .expect(400);
  });

  it('refuses to approve it, and creates nothing at all', async () => {
    const id = await seed();

    const res = await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${id}/approve`)
      .set(auth(admin))
      .expect(409);

    expect(errorOf(res).message).toMatch(/not a serviced area/i);
    // The message names the place, so the admin knows what to fix.
    expect(errorOf(res).message).toMatch(/Model Town/);

    // The load-bearing half: no half-built kitchen left behind.
    expect(await h.prisma.vendor.count()).toBe(0);
    expect(await h.prisma.seller.count()).toBe(0);
    const stillWaitlisted = await h.prisma.sellerApplication.findUniqueOrThrow({ where: { id } });
    expect(stillWaitlisted.status).toBe('waitlisted');
  });

  it('refuses a legacy row whose area id is no longer a real place', async () => {
    // Written straight through Prisma: the DTO would reject this today,
    // but rows like it predate the allowlist and are exactly what the
    // centroid fallback used to swallow.
    const row = await h.prisma.sellerApplication.create({
      data: {
        businessName: 'Legacy Kitchen',
        contactName: 'Old Row',
        email: `legacy-${Date.now()}@example.test`,
        phone: '9800000002',
        category: 'maker',
        specialties: ['pickles_preserves'],
        city: 'Chandigarh',
        area: 'chd-sector-that-never-existed',
        description: 'Predates the area allowlist.',
      },
    });

    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${row.id}/approve`)
      .set(auth(admin))
      .expect(409);

    expect(await h.prisma.vendor.count()).toBe(0);
  });

  it('an admin can assign a real area, and then approval works', async () => {
    const id = await seed();

    await h
      .api()
      .patch(`${API_PREFIX}/admin/sellers/applications/${id}/area`)
      .set(auth(admin))
      .send({ area: 'chd-sector-34', note: 'Closest serviced sector' })
      .expect(200);

    const assigned = await h.prisma.sellerApplication.findUniqueOrThrow({ where: { id } });
    expect(assigned.area).toBe('chd-sector-34');
    // Back in the queue — fixing the data must also make the row visible
    // to the admin who fixed it.
    expect(assigned.status).toBe('reviewing');
    // The applicant's own words are kept, not overwritten.
    expect(assigned.areaLabel).toBe('Model Town, Ludhiana');

    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${id}/approve`)
      .set(auth(admin))
      .expect(201);

    const vendor = await h.prisma.vendor.findFirstOrThrow({});
    expect(vendor.area).toBe('chd-sector-34');
    // Real sector coordinates, not the tricity centroid.
    expect(vendor.lat).toBeCloseTo(30.7196, 3);
  });

  it('the assign-area endpoint only accepts real areas, and is admin-only', async () => {
    const id = await seed();

    await h
      .api()
      .patch(`${API_PREFIX}/admin/sellers/applications/${id}/area`)
      .set(auth(admin))
      .send({ area: 'other' })
      .expect(400);

    const consumer = await createActor(h, 'consumer');
    await h
      .api()
      .patch(`${API_PREFIX}/admin/sellers/applications/${id}/area`)
      .set(auth(consumer))
      .send({ area: 'chd-sector-34' })
      .expect(403);
  });

  it('leaves deliveryRadiusKm null when the applicant does not state one', async () => {
    // The whole point of making the column nullable: NULL is what lets
    // `PlatformSetting.defaultDeliveryRadiusKm` apply at approval. A
    // stored 10 would always win the `||`.
    const id = await seed({ area: 'chd-sector-34', areaLabel: undefined });

    const row = await h.prisma.sellerApplication.findUniqueOrThrow({ where: { id } });
    expect(row.deliveryRadiusKm).toBeNull();

    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${id}/approve`)
      .set(auth(admin))
      .expect(201);

    const vendor = await h.prisma.vendor.findFirstOrThrow({});
    // The platform default from `AdminSettingsService`, not a hardcoded 10.
    expect(vendor.deliveryRadiusKm).toBeGreaterThan(0);
  });

  it('accepts the new home_chef category and gives it a maker storefront', async () => {
    const id = await seed({ area: 'chd-sector-34', areaLabel: undefined });

    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${id}/approve`)
      .set(auth(admin))
      .expect(201);

    const vendor = await h.prisma.vendor.findFirstOrThrow({});
    // `home_chef` has no VendorType of its own on purpose.
    expect(vendor.type).toBe('maker');
  });
});
