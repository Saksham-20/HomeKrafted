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

/**
 * The slowest-growing list in the admin panel — bounded by supply
 * headcount rather than by customers or orders — and still an unbounded
 * `findMany`. "Small today" is what every one of these had in common.
 */
describe('admin HomeKrafter list', () => {
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

  const list = (query = '') =>
    h.api().get(`${API_PREFIX}/admin/sellers${query}`).set(auth(admin)).expect(200);

  it('returns a page with the real total', async () => {
    for (let i = 0; i < 30; i += 1) await createKitchen(h);

    const res = await list();

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
  });

  it('pages without repeating or dropping a HomeKrafter', async () => {
    for (let i = 0; i < 30; i += 1) await createKitchen(h);

    const first = await list();
    const second = await list('?page=2');

    const ids = [...first.body.items, ...second.body.items].map((s: { id: string }) => s.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  it('filters on a list column, so one HomeKrafter can match two specialties', async () => {
    const both = await createKitchen(h);
    await h.prisma.seller.update({
      where: { id: both.seller.id },
      data: { specialties: ['bakery', 'pickles_preserves'] },
    });
    const onlyBakery = await createKitchen(h);
    await h.prisma.seller.update({
      where: { id: onlyBakery.seller.id },
      data: { specialties: ['bakery'] },
    });

    const bakers = await list('?specialty=bakery');
    const picklers = await list('?specialty=pickles_preserves');

    // `has`, not equality — a HomeKrafter who bakes *and* pickles belongs
    // in both lists, which is the entire point of the field being a list.
    expect(bakers.body.total).toBe(2);
    expect(picklers.body.total).toBe(1);
    expect(picklers.body.items[0].id).toBe(both.seller.id);
  });

  it('rejects an unknown specialty rather than ignoring it', async () => {
    await h.api().get(`${API_PREFIX}/admin/sellers?specialty=wizardry`).set(auth(admin)).expect(400);
  });

  it('is still admin-only', async () => {
    const buyer = await createActor(h);
    await h.api().get(`${API_PREFIX}/admin/sellers`).set(auth(buyer)).expect(403);
  });
});

/**
 * There is one wallet per user, so `/admin/wallet` grew with the whole
 * customer base — and the three money totals at the top were computed by
 * reducing over the full array in JavaScript.
 *
 * Same shape as the queue badges: the page can narrow, the platform-wide
 * figure cannot. A "total liability" that only totalled the wallets on
 * screen would be a money number quietly meaning something else.
 */
describe('admin wallet overview', () => {
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

  /** `count` buyers, each with a wallet holding `each` rupees. */
  async function seedWallets(count: number, each: number) {
    for (let i = 0; i < count; i += 1) {
      const buyer = await createActor(h);
      await h.prisma.wallet.upsert({
        where: { userId: buyer.userId },
        create: { userId: buyer.userId, balance: each },
        update: { balance: each },
      });
    }
  }

  const overview = (query = '') =>
    h.api().get(`${API_PREFIX}/admin/wallet${query}`).set(auth(admin)).expect(200);

  it('totals every wallet, while listing only a page of them', async () => {
    // 30 buyers at ₹100, plus the admin's own wallet at ₹0.
    await seedWallets(30, 100);

    const res = await overview();

    expect(res.body.balances).toHaveLength(25);
    // By hand: 30 × 100. The admin's wallet is created lazily on first
    // read and holds nothing, so it moves neither total.
    expect(res.body.totalLiability).toBe(3000);
    expect(res.body.total).toBe(res.body.walletCount);
  });

  it('reports the same liability on page two as on page one', async () => {
    await seedWallets(30, 100);

    const first = await overview();
    const second = await overview('?page=2');

    // The failure this guards is the totals being derived from `balances`
    // — which would make page 2 report a fraction of the platform's money.
    expect(second.body.totalLiability).toBe(first.body.totalLiability);
    expect(second.body.walletCount).toBe(first.body.walletCount);
  });

  it('pages the balances without repeating or dropping a wallet', async () => {
    await seedWallets(30, 100);

    const first = await overview();
    const second = await overview('?page=2');

    const ids = [...first.body.balances, ...second.body.balances].map(
      (b: { walletId: string }) => b.walletId,
    );
    // Every wallet holds the same balance, so the sort key ties on every
    // row — exactly when an ordering with no unique final key starts
    // showing one twice and skipping another.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pages one user\'s ledger by cursor', async () => {
    const buyer = await createActor(h);
    const wallet = await h.prisma.wallet.upsert({
      where: { userId: buyer.userId },
      create: { userId: buyer.userId, balance: 0 },
      update: {},
    });
    const sameInstant = new Date('2026-08-07T10:00:00.000Z');
    for (let i = 0; i < 60; i += 1) {
      await h.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          direction: 'credit',
          category: 'adjustment',
          title: `Row ${i}`,
          amount: 1,
          balanceAfter: i + 1,
          createdAt: sameInstant,
        },
      });
    }

    const first = await h
      .api()
      .get(`${API_PREFIX}/admin/wallet/${buyer.userId}`)
      .set(auth(admin))
      .expect(200);
    expect(first.body.transactions).toHaveLength(50);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await h
      .api()
      .get(`${API_PREFIX}/admin/wallet/${buyer.userId}?cursor=${first.body.nextCursor}`)
      .set(auth(admin))
      .expect(200);
    expect(second.body.transactions).toHaveLength(10);
    expect(second.body.nextCursor).toBeNull();

    const ids = [...first.body.transactions, ...second.body.transactions].map(
      (t: { id: string }) => t.id,
    );
    // All 60 share one `createdAt`, so this is the case where a cursor
    // over a non-total order silently skips rows.
    expect(new Set(ids).size).toBe(60);
  });

  it('is still admin-only', async () => {
    const buyer = await createActor(h);
    await h.api().get(`${API_PREFIX}/admin/wallet`).set(auth(buyer)).expect(403);
  });
});

/**
 * The payout queue, which is the one screen in the admin panel that is
 * entirely about money somebody is waiting for.
 *
 * Its summary was reduced over the loaded rows, so filtering to "Paid"
 * made the header report `pendingCount: 0, pendingTotal: ₹0` while three
 * HomeKrafters waited on ₹14,010. Reproduced against a running server
 * during the audit before it was fixed.
 */
describe('admin payout queue', () => {
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

  async function payout(status: 'pending' | 'paid', amount: number) {
    const kitchen = await createKitchen(h);
    return h.prisma.payout.create({
      data: {
        sellerId: kitchen.seller.id,
        amount,
        status,
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });
  }

  const list = (query = '') =>
    h.api().get(`${API_PREFIX}/admin/payouts${query}`).set(auth(admin)).expect(200);

  it('totals what is owed from every payout, not the ones on screen', async () => {
    await payout('pending', 4000);
    await payout('pending', 6000);
    await payout('paid', 9000);

    const all = await list();
    // By hand: two pending at 4000 and 6000.
    expect(all.body.summary).toEqual({ pendingCount: 2, pendingTotal: 10000, paidTotal: 9000 });

    const onlyPaid = await list('?status=paid');
    // The list narrows to the one paid row…
    expect(onlyPaid.body.items).toHaveLength(1);
    // …and ₹10,000 is still owed. Derived from the loaded rows this said
    // nothing was pending, on the screen that decides who gets paid.
    expect(onlyPaid.body.summary).toEqual({ pendingCount: 2, pendingTotal: 10000, paidTotal: 9000 });
  });

  it('pages without repeating or dropping a payout', async () => {
    for (let i = 0; i < 30; i += 1) await payout('pending', 100);

    const first = await list();
    const second = await list('?page=2');

    expect(first.body.items).toHaveLength(25);
    expect(first.body.total).toBe(30);
    const ids = [...first.body.items, ...second.body.items].map((p: { id: string }) => p.id);
    // Every payout is cut for the same fortnight, so `periodEnd` ties on
    // all thirty — exactly when an ordering with no unique final key
    // starts repeating one row and dropping another.
    expect(new Set(ids).size).toBe(30);
  });
});

describe('admin corporate inquiry queue', () => {
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

  const inquiry = (status: 'new' | 'contacted' | 'quoted') =>
    h.prisma.corporateInquiry.create({
      data: {
        companyName: 'Acme Ltd',
        contactName: 'A Buyer',
        email: 'buyer@acme.test',
        phone: '9845012345',
        estimatedQuantity: 50,
        message: 'Diwali hampers for the team.',
        status,
      },
    });

  it('counts what nobody has touched, whatever the view is filtered to', async () => {
    await inquiry('new');
    await inquiry('new');
    await inquiry('quoted');

    const all = await h.api().get(`${API_PREFIX}/admin/corporate-inquiries`).set(auth(admin)).expect(200);
    expect(all.body.summary).toEqual({ unworked: 2, contacted: 0, quoted: 1 });

    const quoted = await h
      .api()
      .get(`${API_PREFIX}/admin/corporate-inquiries?status=quoted`)
      .set(auth(admin))
      .expect(200);

    expect(quoted.body.items).toHaveLength(1);
    // Two inquiries are still untouched. This read zero.
    expect(quoted.body.summary).toEqual({ unworked: 2, contacted: 0, quoted: 1 });
  });
});
