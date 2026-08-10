import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  errorOf,
  resetDatabase,
} from './harness';

/**
 * The unified review queue, and the hole it closes.
 *
 * **What was broken.** M22 put the catalogue review gate on three tables —
 * `Product`, `Snack` and `MealPlan`. All three default to `pending`, all
 * three are filtered out of buyer-facing queries by `PUBLICLY_LISTED`. The
 * admin half was built for `Product` only: the queue read
 * `prisma.product`, and the sole moderation endpoint was
 * `PATCH /admin/catalog/products/:id/moderate`.
 *
 * So a snack or a meal plan created after M22 **could never go live**. Not
 * "was hard to find" — there was no code path anywhere that could move one
 * off `pending`. The HomeKrafter was correctly told their item was waiting
 * for approval, the dashboard SLA card reported the queue clear because it
 * counted products alone, and the only remedy was a manual database write.
 * Found on the live site on 2026-08-10 by a maker whose first menu item
 * never appeared in the shop.
 *
 * That is the shape of bug this layer exists for: every rule involved is
 * enforced by a query, so a mocked Prisma would have happily confirmed the
 * behaviour of code that reached two of the three tables.
 */
describe('the catalogue review queue', () => {
  let h: Harness;
  let admin: Actor;
  let kitchen: Awaited<ReturnType<typeof createKitchen>>;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    admin = await createActor(h, 'admin');
    kitchen = await createKitchen(h);
  });

  async function seedSnack(overrides: { name?: string } = {}) {
    return h.prisma.snack.create({
      data: {
        slug: `snack-${Math.random().toString(36).slice(2, 10)}`,
        name: overrides.name ?? 'Masala Mathri',
        description: 'Crisp, peppery, fried this morning',
        price: 180,
        category: 'savoury',
        diet: 'veg',
        imagePlaceholder: 'mathri',
        available: true,
        sellerId: kitchen.seller.id,
        // Exactly what `MenuService.create` writes via `initialSubmission()`.
        moderationStatus: 'pending',
        submittedAt: new Date(),
      },
    });
  }

  it('lists a pending snack, which no admin surface could see before', async () => {
    const snack = await seedSnack();

    const res = await h.api().get(`${API_PREFIX}/admin/catalog/queue`)
      .set(auth(admin))
      .expect(200);

    const found = res.body.items.find(
      (i: { kind: string; id: string }) => i.kind === 'snack' && i.id === snack.id,
    );
    expect(found).toBeDefined();
    expect(found.name).toBe('Masala Mathri');
    // The maker's name, because the first question about an unfamiliar
    // listing is whose it is.
    expect(found.makerName).toBe(kitchen.seller.displayName);
    expect(res.body.counts.snack).toBe(1);
  });

  /**
   * The whole point. Before this endpoint existed, this sequence was
   * impossible to perform through the API at all.
   */
  it('approves a snack, and the buyer-facing list then shows it', async () => {
    const snack = await seedSnack();

    // Invisible to buyers while pending.
    const before = await h.api().get(`${API_PREFIX}/snacks`).expect(200);
    expect(before.body.map((s: { id: string }) => s.id)).not.toContain(snack.id);

    await h.api()
      .patch(`${API_PREFIX}/admin/catalog/snacks/${snack.id}/moderate`)
      .set(auth(admin))
      .send({ action: 'approve' })
      .expect(200);

    const after = await h.api().get(`${API_PREFIX}/snacks`).expect(200);
    expect(after.body.map((s: { id: string }) => s.id)).toContain(snack.id);

    // And it leaves the queue, so the backlog is worked to empty.
    const queue = await h.api().get(`${API_PREFIX}/admin/catalog/queue`)
      .set(auth(admin))
      .expect(200);
    expect(queue.body.counts.snack).toBe(0);
  });

  /**
   * M22's rule, which must hold for the new types too: the reason is the
   * only thing telling a HomeKrafter what to change, so a refusal without
   * one is refused.
   */
  it('refuses to reject a snack without a reason', async () => {
    const snack = await seedSnack();

    const res = await h.api()
      .patch(`${API_PREFIX}/admin/catalog/snacks/${snack.id}/moderate`)
      .set(auth(admin))
      .send({ action: 'reject' })
      .expect(400);
    expect(errorOf(res).message).toMatch(/reason/i);

    // Still pending — a refused refusal must not have half-applied.
    const row = await h.prisma.snack.findUnique({ where: { id: snack.id } });
    expect(row?.moderationStatus).toBe('pending');
  });

  it('stores a rejection reason verbatim, for the maker to read', async () => {
    const snack = await seedSnack();
    const reason = 'The photo is too dark to see the jar — please reshoot in daylight.';

    await h.api()
      .patch(`${API_PREFIX}/admin/catalog/snacks/${snack.id}/moderate`)
      .set(auth(admin))
      .send({ action: 'reject', reason })
      .expect(200);

    const row = await h.prisma.snack.findUnique({ where: { id: snack.id } });
    expect(row?.moderationStatus).toBe('rejected');
    // Verbatim. Paraphrasing in the notification layer is how the one
    // actionable sentence gets lost (M22).
    expect(row?.moderationNote).toBe(reason);
  });

  /** Every decision is attributable — the audit log is how "who did this" is answered. */
  it('audits the decision', async () => {
    const snack = await seedSnack();

    await h.api()
      .patch(`${API_PREFIX}/admin/catalog/snacks/${snack.id}/moderate`)
      .set(auth(admin))
      .send({ action: 'approve' })
      .expect(200);

    const row = await h.prisma.adminAuditLog.findFirst({
      where: { targetType: 'Snack', targetId: snack.id },
    });
    expect(row).toBeTruthy();
    expect(row?.action).toBe('snack.approve');
    expect(row?.actorId).toBe(admin.userId);
  });

  it('404s for a snack that does not exist', async () => {
    await h.api()
      .patch(`${API_PREFIX}/admin/catalog/snacks/nope/moderate`)
      .set(auth(admin))
      .send({ action: 'approve' })
      .expect(404);
  });

  /** Unscoped admin oversight is admin-only, like every other route here. */
  it('is closed to a HomeKrafter and to a shopper', async () => {
    const snack = await seedSnack();
    const seller = await createActor(h, 'seller');
    const shopper = await createActor(h, 'consumer');

    for (const actor of [seller, shopper]) {
      await h.api().get(`${API_PREFIX}/admin/catalog/queue`).set(auth(actor)).expect(403);
      await h.api()
        .patch(`${API_PREFIX}/admin/catalog/snacks/${snack.id}/moderate`)
        .set(auth(actor))
        .send({ action: 'approve' })
        .expect(403);
    }
  });

  /**
   * The dashboard card said "queue clear" while a snack waited, because it
   * counted `Product` alone. An operations card that under-reports is worse
   * than no card: it is a reason not to look.
   */
  it('counts a pending snack in the dashboard moderation SLA', async () => {
    await seedSnack();

    const res = await h.api().get(`${API_PREFIX}/admin/dashboard`)
      .set(auth(admin))
      .expect(200);

    expect(res.body.pendingListingsCount).toBeGreaterThanOrEqual(1);
    expect(res.body.oldestPendingListingAt).toBeTruthy();
  });
});
