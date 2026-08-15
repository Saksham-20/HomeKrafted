import { API_PREFIX, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * The standardised `/sell` intake, end to end (M32).
 *
 * The field rules themselves are unit-tested
 * (`test/unit/application-fields.spec.ts`); `POST /seller-applications`
 * carries a real `@Throttle({ limit: 5, ttl: 60_000 })` and a public
 * endpoint should stay throttled, so what is spent here is only what has
 * to go through the front door: that the endpoint refuses at all, that
 * what somebody types is stored normalised, and that it reaches the
 * profile at approval. Anything else is seeded straight into the table,
 * the same pattern `seller-application-area.e2e-spec.ts` uses.
 */
describe('seller application intake (M32)', () => {
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

  const valid = {
    businessName: "Anjali's Kitchen",
    contactName: 'Anjali Mehta',
    email: 'anjali@example.test',
    phone: '98450 12345',
    specialties: ['homemade_food'],
    city: 'Chandigarh',
    area: 'chd-sector-34',
    description: 'Punjabi thali cooked at home.',
    // Required by the intake since M36b — the address a rider collects
    // from. These specs predate it and 400'd on every submit.
    addressLine1: '1203, Sector 34-A',
  };

  const submit = (body: Record<string, unknown> = {}) =>
    h.api().post(`${API_PREFIX}/seller-applications`).send({ ...valid, ...body });

  it('refuses an email address in the box that becomes the storefront name', async () => {
    const res = await submit({ businessName: 'anjali@example.test' }).expect(400);
    // The message is the product on a public form — it has to name the
    // box and say what to put in it, not report a failed regex.
    expect(res.body.error.message).toMatch(/email/i);
  });

  it('stores what somebody typed in one canonical shape', async () => {
    const res = await submit({
      phone: '98450 12345',
      instagramUrl: '@anjalis.kitchen',
      websiteUrl: 'anjalis.example',
      fssaiNumber: '1234 5678 9012 34',
      yearsMaking: 6,
      capacityPerDay: 12,
    }).expect(201);

    expect(res.body.phone).toBe('+919845012345');
    expect(res.body.instagramUrl).toBe('https://instagram.com/anjalis.kitchen');
    expect(res.body.websiteUrl).toBe('https://anjalis.example/');
    expect(res.body.fssaiNumber).toBe('12345678901234');
    expect(res.body.yearsMaking).toBe(6);
    expect(res.body.capacityPerDay).toBe(12);
  });

  it('records a food licence only for somebody who makes food', async () => {
    // A candle maker who typed into a box that should not have been shown
    // does not get a food licence recorded against their name.
    const res = await submit({
      specialties: ['candles'],
      fssaiNumber: '12345678901234',
    }).expect(201);

    expect(res.body.fssaiNumber).toBeUndefined();
  });

  it('leaves "didn\'t say" as null, never zero', async () => {
    const res = await submit().expect(201);

    expect(res.body.yearsMaking).toBeUndefined();
    const row = await h.prisma.sellerApplication.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.yearsMaking).toBeNull();
    expect(row.capacityPerDay).toBeNull();
  });

  describe('what they said reaches the storefront', () => {
    /** Seeded, not submitted — the intake's throttle budget is spent above. */
    const seed = (over: Record<string, unknown> = {}) =>
      h.prisma.sellerApplication.create({
        data: {
          businessName: "Anjali's Kitchen",
          contactName: 'Anjali Mehta',
          email: 'seeded@example.test',
          phone: '+919845012399',
          category: 'home_chef',
          specialties: ['homemade_food'],
          city: 'Chandigarh',
          area: 'chd-sector-34',
          description: 'Punjabi thali cooked at home.',
          status: 'new',
          ...over,
        },
      });

    const approve = async (applicationId: string) => {
      const admin = await createActor(h, 'admin');
      const res = await h
        .api()
        .post(`${API_PREFIX}/admin/sellers/applications/${applicationId}/approve`)
        .set(auth(admin))
        .send({})
        .expect(201);
      return res.body.vendor.id as string;
    };

    it('carries links, licence and capacity onto the profile at approval', async () => {
      const application = await seed({
        instagramUrl: 'https://instagram.com/anjalis.kitchen',
        websiteUrl: 'https://anjalis.example/',
        fssaiNumber: '12345678901234',
        capacityPerDay: 12,
      });

      const vendorId = await approve(application.id);
      const profile = await h.prisma.vendorProfile.findUniqueOrThrow({ where: { vendorId } });

      expect(profile.instagramUrl).toBe('https://instagram.com/anjalis.kitchen');
      expect(profile.websiteUrl).toBe('https://anjalis.example/');
      expect(profile.fssaiNumber).toBe('12345678901234');
      expect(profile.capacityPerDay).toBe(12);
      // Recorded, never verified. The badge has exactly one write path and
      // this is not it (M16) — otherwise anybody could type fourteen
      // digits into a public form and arrive verified.
      expect(profile.fssaiVerified).toBe(false);
    });

    it('creates no empty profile row when they said none of it', async () => {
      const application = await seed({ email: 'sparse@example.test' });

      const vendorId = await approve(application.id);

      // An empty `VendorProfile` is not the same as none: completion is
      // computed from what is present, and a row of nulls would report a
      // kitchen as having started something it never did.
      expect(await h.prisma.vendorProfile.findUnique({ where: { vendorId } })).toBeNull();
    });
  });
});
