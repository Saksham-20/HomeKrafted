import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * `GET /admin/users` returned **every account on the platform** — the one
 * query on this server that grows with the entire customer base — and the
 * screen filtered and searched the array in the browser.
 *
 * The pagination is the smaller half. The half worth testing is that role,
 * status and search all moved to SQL with it: a filter applied to a page
 * means "filter the twenty-five rows on screen", so an admin looking up
 * the person currently on the phone to them would be told no such account
 * exists.
 */
describe('admin user list', () => {
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

  /**
   * `count` extra consumers, on top of whatever actors a test has already
   * made — through the real registration endpoint, deliberately.
   *
   * `createActor` names every account "Test consumer", so thirty of them
   * all derive their referral code from the same first name. That is what
   * this seed originally hit: the code space for one name was ten wide, so
   * the eleventh registration failed with "Could not allocate a unique
   * referral code — please retry" and no retry could ever succeed. Writing
   * rows straight through Prisma would have made the symptom go away and
   * left the bug in the signup path, so this keeps going through the API.
   */
  async function seedConsumers(count: number) {
    const made: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const actor = await createActor(h);
      made.push(actor.userId);
    }
    return made;
  }

  const list = (query = '') =>
    h.api().get(`${API_PREFIX}/admin/users${query}`).set(auth(admin)).expect(200);

  it('returns a page, not every account', async () => {
    await seedConsumers(29); // + the admin above = 30 accounts.

    const res = await list();

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
    expect(res.body.page).toBe(1);
  });

  it('pages through without repeating or dropping an account', async () => {
    await seedConsumers(29);

    const first = await list();
    const second = await list('?page=2');

    const ids = [...first.body.items, ...second.body.items].map((u: { id: string }) => u.id);
    expect(ids).toHaveLength(30);
    // Every actor is created in a tight loop, so `createdAt` ties are the
    // normal case here rather than a contrivance — which is exactly when
    // an ordering with no unique tiebreaker starts duplicating rows.
    expect(new Set(ids).size).toBe(30);
  });

  it('finds an account that is not on the first page', async () => {
    await seedConsumers(29);
    // The oldest account, so it sorts last under `createdAt desc`.
    const buried = await h.prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

    const res = await list(`?q=${encodeURIComponent(buried.email!)}`);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(buried.id);
  });

  it('searches case-insensitively, on name as well as email', async () => {
    const buyer = await createActor(h);
    const user = await h.prisma.user.update({
      where: { id: buyer.userId },
      data: { name: 'Ananya Iyer' },
    });

    const res = await list(`?q=${encodeURIComponent('ANANYA')}`);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(user.id);
  });

  it('filters by role, and counts only that role', async () => {
    await seedConsumers(3);
    await createActor(h, 'seller');

    const sellers = await list('?role=seller');
    expect(sellers.body.total).toBe(1);
    expect(sellers.body.items.every((u: { role: string }) => u.role === 'seller')).toBe(true);

    // A total that ignored the filter would render "Page 1 of 2" over one
    // short page.
    const admins = await list('?role=admin');
    expect(admins.body.total).toBe(1);
  });

  it('filters by suspension in both directions', async () => {
    const suspended = await createActor(h);
    await createActor(h);
    await h.prisma.user.update({ where: { id: suspended.userId }, data: { suspended: true } });

    const off = await list('?status=suspended');
    expect(off.body.total).toBe(1);
    expect(off.body.items[0].id).toBe(suspended.userId);

    // The admin plus the one other consumer.
    const on = await list('?status=active');
    expect(on.body.total).toBe(2);
    expect(on.body.items.some((u: { id: string }) => u.id === suspended.userId)).toBe(false);
  });

  it('combines a search with a filter rather than letting one replace the other', async () => {
    const seller = await createActor(h, 'seller');
    await h.prisma.user.update({ where: { id: seller.userId }, data: { name: 'Anjali Menon' } });
    const consumer = await createActor(h);
    await h.prisma.user.update({ where: { id: consumer.userId }, data: { name: 'Anjali Rao' } });

    // Both match "Anjali"; only one is a seller. Building the `where` with
    // two `OR` keys instead of combining them silently drops the role.
    const res = await list('?role=seller&q=Anjali');

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(seller.userId);
  });

  it('rejects an unknown role or status rather than ignoring it', async () => {
    await h.api().get(`${API_PREFIX}/admin/users?role=wizard`).set(auth(admin)).expect(400);
    await h.api().get(`${API_PREFIX}/admin/users?status=maybe`).set(auth(admin)).expect(400);
  });

  it('is still admin-only', async () => {
    const buyer = await createActor(h);
    await h.api().get(`${API_PREFIX}/admin/users`).set(auth(buyer)).expect(403);
  });
});
