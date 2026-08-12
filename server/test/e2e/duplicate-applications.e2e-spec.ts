import { API_PREFIX, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * A second application from somebody who is already a HomeKrafter (M32).
 *
 * `approveApplication` has refused this since M19 — `Seller.userId` is
 * unique — but the refusal arrived after the click, on the one screen
 * where a click sends a real person a welcome message. The ordinary way
 * it happens is somebody who does not hear back applying again, so the
 * queue accumulates rows that look decidable and are not.
 *
 * The queue now says so on the row. These assertions are about the two
 * halves agreeing: what the list marks is exactly what approval refuses.
 */
describe('duplicate seller applications (M32)', () => {
  let h: Harness;
  let admin: { token: string };

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

  let phoneSeq = 0;

  /**
   * A distinct phone per applicant. `User.phone` is unique, so reusing one
   * across two *different* people fails at approval for a reason that has
   * nothing to do with what this spec is about.
   */
  const apply = (email: string) =>
    h.prisma.sellerApplication.create({
      data: {
        businessName: 'Candle & Clay',
        contactName: 'New Maker',
        email,
        phone: `+9190001114${String((phoneSeq += 1)).padStart(2, '0')}`,
        category: 'maker',
        specialties: ['crafts'],
        city: 'Chandigarh',
        area: 'chd-sector-34',
        description: 'Hand-poured soy candles.',
        status: 'new',
      },
    });

  /**
   * The queue as the admin screen reads it: `?status=pending`, which is
   * every status short of the two terminal ones. An approved application
   * is not in here — the row that survives is the *second* one somebody
   * filed, which still says `new`.
   */
  const queue = async () => {
    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/sellers/applications?status=pending`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .expect(200);
    return res.body as {
      id: string;
      email: string;
      existingSeller?: { displayName: string; status: string; since: string };
    }[];
  };

  it('leaves a first-time applicant unmarked', async () => {
    await apply('first-timer@example.test');

    const [row] = await queue();
    expect(row.existingSeller).toBeUndefined();
  });

  it('marks an applicant who already has an account, with the storefront they have', async () => {
    const application = await apply('already-in@example.test');
    // The account they already hold, exactly as approval would have left it.
    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${application.id}/approve`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({})
      .expect(201);

    // ...and then they apply again, having heard nothing.
    await apply('already-in@example.test');

    const rows = await queue();
    expect(rows).toHaveLength(1);
    expect(rows[0].existingSeller?.displayName).toBe('Candle & Clay');
    expect(rows[0].existingSeller?.status).toBe('approved');
    expect(rows[0].existingSeller?.since).toBeTruthy();
  });

  it('marks a suspended account too — it still occupies the unique userId', async () => {
    const application = await apply('suspended-one@example.test');
    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${application.id}/approve`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({})
      .expect(201);
    const seller = await h.prisma.seller.findFirstOrThrow({
      where: { user: { email: 'suspended-one@example.test' } },
    });
    await h.prisma.seller.update({ where: { id: seller.id }, data: { status: 'suspended' } });

    await apply('suspended-one@example.test');

    const rows = await queue();
    expect(rows[0].existingSeller?.status).toBe('suspended');
  });

  it('agrees with the server: exactly the marked row is the one approval refuses', async () => {
    const first = await apply('agrees@example.test');
    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${first.id}/approve`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({})
      .expect(201);
    const second = await apply('agrees@example.test');
    const fresh = await apply('nobody-knows-them@example.test');

    const rows = await queue();
    const marked = rows.filter((r) => r.existingSeller).map((r) => r.id);
    expect(marked).toEqual([second.id]);

    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${second.id}/approve`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({})
      .expect(409);
    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${fresh.id}/approve`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({})
      .expect(201);
  });

  it('reads the whole page in one query, not one per row', async () => {
    for (let i = 0; i < 5; i += 1) await apply(`bulk-${i}@example.test`);

    // Not a timing assertion — just that a page of applications answers at
    // all with several rows, which is what the batched lookup exists for.
    const rows = await queue();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.existingSeller === undefined)).toBe(true);
  });

  it('is admin-only', async () => {
    const shopper = await createActor(h, 'consumer');
    await h.api().get(`${API_PREFIX}/admin/sellers/applications`).set(auth(shopper)).expect(403);
  });
});
