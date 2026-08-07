import { API_PREFIX, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * `GET /wallet/transactions` returned **every row a wallet had ever
 * accumulated**, on a table that only grows and that a regular buyer adds
 * to several times per order. Nothing capped it, and the screen it fed
 * renders six rows.
 *
 * These are the rules that make the cursor page trustworthy rather than
 * merely smaller. Every count here is computed by hand from a known
 * number of seeded rows — a figure copied out of a run would lock in
 * whatever the code did that day.
 */
describe('wallet ledger pagination', () => {
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

  /**
   * Rows are written through Prisma directly rather than by placing 60
   * orders: the subject under test is the read path, and driving 60 real
   * checkouts would make this a five-minute test of something else.
   *
   * All 60 share one `createdAt` on purpose. That is not artificial — the
   * transactions a single order writes (debit, cashback) genuinely land in
   * the same millisecond, which is exactly the case where `createdAt` is
   * not a total order and a cursor over it skips rows.
   */
  async function seedLedger(userId: string, count: number) {
    const wallet = await h.prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });
    const sameInstant = new Date('2026-08-07T10:00:00.000Z');
    for (let i = 0; i < count; i += 1) {
      await h.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          direction: 'credit',
          category: 'adjustment',
          title: `Row ${String(i).padStart(3, '0')}`,
          amount: 1,
          balanceAfter: i + 1,
          createdAt: sameInstant,
        },
      });
    }
    return wallet;
  }

  it('caps an uncapped ledger at one page and says there is more', async () => {
    const buyer = await createActor(h);
    await seedLedger(buyer.userId, 60);

    const res = await h
      .api()
      .get(`${API_PREFIX}/wallet/transactions`)
      .set(auth(buyer))
      .expect(200);

    // 50 is the default page; 60 rows exist, so 10 are left over.
    expect(res.body.items).toHaveLength(50);
    expect(res.body.nextCursor).toBe(res.body.items[49].id);
  });

  it('walks the whole ledger exactly once across pages', async () => {
    const buyer = await createActor(h);
    await seedLedger(buyer.userId, 60);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await h
        .api()
        .get(`${API_PREFIX}/wallet/transactions?limit=25${cursor ? `&cursor=${cursor}` : ''}`)
        .set(auth(buyer))
        .expect(200);
      seen.push(...res.body.items.map((row) => row.id));
      cursor = res.body.nextCursor;
      pages += 1;
      // A cursor that never advances is an infinite loop, and a test that
      // hangs reports as a timeout somewhere else entirely.
      expect(pages).toBeLessThanOrEqual(5);
    } while (cursor);

    // 60 rows at 25 a page: 25 + 25 + 10.
    expect(pages).toBe(3);
    expect(seen).toHaveLength(60);
    // The rule this file exists for. With 60 identical `createdAt` values
    // and no `id` tiebreaker, this is where rows get shown twice and
    // others never appear at all.
    expect(new Set(seen).size).toBe(60);
  });

  it('never returns another wallet’s row, whatever cursor is passed', async () => {
    const mine = await createActor(h);
    const theirs = await createActor(h);
    await seedLedger(mine.userId, 5);
    const theirWallet = await seedLedger(theirs.userId, 5);

    const theirRows = await h.prisma.walletTransaction.findMany({
      where: { walletId: theirWallet.id },
      select: { id: true },
    });

    const res = await h
      .api()
      .get(`${API_PREFIX}/wallet/transactions?cursor=${theirRows[0].id}`)
      .set(auth(mine))
      .expect(200);

    const returned: string[] = res.body.items.map((row: { id: string }) => row.id);
    const foreign = new Set(theirRows.map((row) => row.id));
    expect(returned.filter((id) => foreign.has(id))).toEqual([]);
  });

  it('refuses a limit large enough to be a way of asking for everything', async () => {
    const buyer = await createActor(h);
    await seedLedger(buyer.userId, 5);

    await h
      .api()
      .get(`${API_PREFIX}/wallet/transactions?limit=100000`)
      .set(auth(buyer))
      .expect(400);
  });

  it('reports the last page with a null cursor, not an empty one', async () => {
    const buyer = await createActor(h);
    await seedLedger(buyer.userId, 3);

    const res = await h
      .api()
      .get(`${API_PREFIX}/wallet/transactions`)
      .set(auth(buyer))
      .expect(200);

    expect(res.body.items).toHaveLength(3);
    // `null`, not `undefined` and not the last row's id — a client stops
    // paging on this value, and "there might be more" is the difference
    // between a Load more button and none.
    expect(res.body.nextCursor).toBeNull();
  });
});
