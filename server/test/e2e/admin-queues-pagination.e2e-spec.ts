import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createCategory,
  createHarness,
  createKitchen,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * The two admin queues, and the counts that head them.
 *
 * Both endpoints read their whole table — every listing with its
 * relations, every ticket with its whole message thread — and both screens
 * filtered the result in the browser. Paginating them is the easy half.
 *
 * The half worth the file is the **badge**. Each queue leads with a count
 * of what is waiting, and each used to derive that count from the rows it
 * happened to have loaded. So narrowing the view changed the number: on
 * support, clicking "Resolved" made the header report that nobody was
 * waiting, on the one screen whose entire job is telling an admin who is.
 * Both counts are now their own queries, deliberately unscoped, and these
 * tests assert exactly that by filtering to something else and checking
 * the badge did not move.
 */
describe('admin catalogue queue', () => {
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

  /** `pending` listings and `active` ones, from one kitchen. */
  async function seedListings(pending: number, active: number) {
    const kitchen = await createKitchen(h);
    const category = await createCategory(h);
    for (let i = 0; i < pending; i += 1) {
      await createProduct(h, kitchen.vendor.id, category.id, {
        name: `Pending listing ${i}`,
        moderationStatus: 'pending',
      });
    }
    for (let i = 0; i < active; i += 1) {
      await createProduct(h, kitchen.vendor.id, category.id, {
        name: `Live listing ${i}`,
        moderationStatus: 'active',
      });
    }
    return kitchen;
  }

  const list = (query = '') =>
    h.api().get(`${API_PREFIX}/admin/catalog/products${query}`).set(auth(admin)).expect(200);

  it('returns a page with the real total', async () => {
    await seedListings(5, 25);

    const res = await list();

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
  });

  it('puts everything pending first, before anything decided', async () => {
    await seedListings(5, 25);

    const res = await list();

    const statuses = res.body.items.map((p: { moderationStatus: string }) => p.moderationStatus);
    expect(statuses.slice(0, 5)).toEqual(Array(5).fill('pending'));
    expect(statuses.slice(5).includes('pending')).toBe(false);
  });

  it('pages across the pending/decided boundary without losing a listing', async () => {
    await seedListings(5, 25);

    const first = await list();
    const second = await list('?page=2');

    const ids = [...first.body.items, ...second.body.items].map((p: { id: string }) => p.id);
    expect(ids).toHaveLength(30);
    // Every listing is created in a tight loop, so `createdAt` ties are
    // the normal case — exactly when an ordering with no unique final key
    // starts repeating one row and dropping another.
    expect(new Set(ids).size).toBe(30);
  });

  it('keeps the waiting badge honest while the view is filtered elsewhere', async () => {
    await seedListings(5, 25);

    const unfiltered = await list();
    const lookingAtLive = await list('?status=active');

    expect(unfiltered.body.pendingCount).toBe(5);
    // The whole point. This used to be counted from the loaded rows, so
    // filtering to "active" reported zero listings waiting — and a queue
    // badge reading zero is how a HomeKrafter waits a week.
    expect(lookingAtLive.body.pendingCount).toBe(5);
    expect(lookingAtLive.body.total).toBe(25);
  });

  it('filters by status, and counts only that status', async () => {
    await seedListings(5, 25);

    const res = await list('?status=pending');

    expect(res.body.total).toBe(5);
    expect(res.body.items).toHaveLength(5);
  });

  it('searches by listing name across the whole catalogue', async () => {
    await seedListings(2, 28);

    // "Pending listing 1" is on page 1 anyway; the point is that the
    // search reaches a listing by name rather than by position.
    const res = await list('?q=Live%20listing%2027');

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe('Live listing 27');
  });

  it('rejects an unknown status rather than ignoring it', async () => {
    await h
      .api()
      .get(`${API_PREFIX}/admin/catalog/products?status=banished`)
      .set(auth(admin))
      .expect(400);
  });
});

describe('admin support queue', () => {
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
   * A ticket whose newest message is from `lastSender` — which is what
   * "awaiting reply" means. The two messages are given explicit, distinct
   * timestamps: written in one loop they would share a `createdAt` to the
   * millisecond, and then "the newest message" has no single answer.
   */
  async function ticket(status: 'open' | 'in_progress' | 'resolved', lastSender: 'user' | 'agent') {
    const user = await createActor(h);
    const row = await h.prisma.supportTicket.create({
      data: { userId: user.userId, subject: 'A question', status, channel: 'email' },
    });
    await h.prisma.supportMessage.create({
      data: {
        ticketId: row.id,
        sender: 'user',
        body: 'Hello?',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    });
    if (lastSender === 'agent') {
      await h.prisma.supportMessage.create({
        data: {
          ticketId: row.id,
          sender: 'agent',
          body: 'Looking into it.',
          createdAt: new Date('2026-08-01T11:00:00.000Z'),
        },
      });
    }
    return row;
  }

  const queue = (query = '') =>
    h.api().get(`${API_PREFIX}/admin/support/tickets${query}`).set(auth(admin)).expect(200);

  it('counts who is waiting on us, by who spoke last', async () => {
    await ticket('open', 'user'); // waiting
    await ticket('open', 'agent'); // answered
    await ticket('in_progress', 'user'); // waiting
    await ticket('resolved', 'user'); // reopens if they write again, so not waiting

    const res = await queue();

    expect(res.body.summary).toEqual({ open: 2, inProgress: 1, awaitingReply: 2 });
  });

  it('keeps the summary whole while the list is filtered', async () => {
    await ticket('open', 'user');
    await ticket('in_progress', 'user');
    await ticket('resolved', 'agent');

    const res = await queue('?status=resolved');

    // The list narrows to the one resolved ticket…
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    // …and the header still reports the queue. Derived from the loaded
    // rows, this said `{ open: 0, inProgress: 0, awaitingReply: 0 }` —
    // "nobody is waiting", to an admin with two people waiting.
    expect(res.body.summary).toEqual({ open: 1, inProgress: 1, awaitingReply: 2 });
  });

  it('treats a ticket with no messages at all as waiting on us', async () => {
    const user = await createActor(h);
    await h.prisma.supportTicket.create({
      data: { userId: user.userId, subject: 'Empty', status: 'open', channel: 'email' },
    });

    // There is no last sender, so the fallback decides. "Waiting on us" is
    // the safe direction: the cost of a spurious badge is a glance, the
    // cost of the other default is a person nobody answers.
    const res = await queue();
    expect(res.body.summary.awaitingReply).toBe(1);
  });

  it('returns a page with the real total', async () => {
    for (let i = 0; i < 30; i += 1) await ticket('open', 'user');

    const res = await queue();

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
    expect(res.body.summary.awaitingReply).toBe(30);
  });

  it('pages without repeating or dropping a ticket', async () => {
    for (let i = 0; i < 30; i += 1) await ticket('open', 'user');

    const first = await queue();
    const second = await queue('?page=2');

    const ids = [...first.body.items, ...second.body.items].map((t: { id: string }) => t.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  it('is still admin-only', async () => {
    const buyer = await createActor(h);
    await h.api().get(`${API_PREFIX}/admin/support/tickets`).set(auth(buyer)).expect(403);
  });
});
