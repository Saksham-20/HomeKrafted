import {
  API_PREFIX,
  Actor,
  Harness,
  approveProduct,
  auth,
  createActor,
  createCategory,
  createHarness,
  createKitchen,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * The M22 review gate: a listing is checked before it is public, rather
 * than taken down afterwards.
 *
 * **Why this spec is long.** The gate is not one check — it is the
 * absence of a way round, and there were seven ways round. Before M22
 * `Product.moderationStatus` defaulted to `active`, so a listing was live
 * the instant it was saved; every public query filtered on
 * `{ not: 'hidden' }`, a **denylist**, which meant adding `pending` to the
 * enum would have published unreviewed listings while looking like it
 * worked; `getBySlug` filtered on nothing at all; and `cart.addItem` never
 * looked at moderation in its life, so a listing could be bought by anyone
 * holding its id regardless of what any browse surface showed.
 *
 * Each `it` below is one of those doors. A gate that closes six of seven
 * is not a gate, so they are tested individually rather than through one
 * happy path.
 */
describe('catalogue review gate', () => {
  let h: Harness;
  let seller: Actor;
  let buyer: Actor;
  let vendorId: string;
  let vendorSlug: string;
  let categoryId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const kitchen = await createKitchen(h);
    vendorId = kitchen.vendor.id;
    vendorSlug = kitchen.vendor.slug;
    seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
    buyer = await createActor(h, 'consumer');
    categoryId = (await createCategory(h)).id;
  });

  function listingBody(overrides: Record<string, unknown> = {}) {
    const sku = `sku-${Math.random().toString(36).slice(2, 10)}`;
    return {
      name: 'Sandalwood soy candle',
      categoryId,
      description: 'Hand-poured, about forty hours of burn.',
      isPackaged: true,
      cashbackPct: 5,
      weightOptions: [{ sku, label: 'Single', price: 640, mrp: 750, stock: 24 }],
      defaultWeightSku: sku,
      ...overrides,
    };
  }

  const createListing = (body: Record<string, unknown> = listingBody()) =>
    h.api().post(`${API_PREFIX}/seller/listings`).set(auth(seller)).send(body);

  const shopSlugs = async () =>
    (await h.api().get(`${API_PREFIX}/products`).expect(200)).body.items.map(
      (p: { slug: string }) => p.slug,
    );

  describe('a new listing is not public', () => {
    it('saves as pending, stamped with when it entered the queue', async () => {
      const res = await createListing().expect(201);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.moderationStatus).toBe('pending');
      // The queue orders on this, so an unset value would put every new
      // listing in an undefined position.
      expect(row.submittedAt).not.toBeNull();
      expect(row.moderationNote).toBeNull();
      expect(row.moderatedById).toBeNull();
    });

    it('stays off the shop, the storefront and search', async () => {
      const res = await createListing().expect(201);
      const slug: string = res.body.slug;

      expect(await shopSlugs()).not.toContain(slug);

      const storefront = await h.api().get(`${API_PREFIX}/vendors/${vendorSlug}/products`).expect(200);
      expect(storefront.body.map((p: { slug: string }) => p.slug)).not.toContain(slug);

      // Search is `GET /products?q=` — there is no separate search
      // controller, which is exactly why the moderation filter living in
      // `ProductsService.list` covers it.
      const search = await h.api().get(`${API_PREFIX}/products?q=Sandalwood`).expect(200);
      expect(search.body.items.map((p: { slug: string }) => p.slug)).not.toContain(slug);
    });

    it('404s on a direct link, so knowing the slug is not a preview', async () => {
      /*
        The slug is derived from the name, so for anything with a guessable
        name this is not guessing at all. Without this check the whole gate
        is bypassable by typing a URL — every browse surface could be
        correct and the listing still readable.
      */
      const res = await createListing().expect(201);
      await h.api().get(`${API_PREFIX}/products/${res.body.slug}`).expect(404);
    });

    it('cannot be added to a cart', async () => {
      // `cart.addItem` had **no** moderation check before M22 — it resolved
      // a product by id and never looked. That made every browse filter
      // cosmetic for anyone willing to call the API directly.
      const res = await createListing().expect(201);
      const sku = res.body.weightOptions[0].sku;

      await h
        .api()
        .post(`${API_PREFIX}/cart/items`)
        .set(auth(buyer))
        .send({ productId: res.body.id, sku, quantity: 1 })
        .expect(404);
    });

    it('cannot be saved to a wishlist', async () => {
      const res = await createListing().expect(201);
      await h
        .api()
        .post(`${API_PREFIX}/wishlist/items`)
        .set(auth(buyer))
        .send({ productId: res.body.id })
        .expect(404);
    });
  });

  describe('approval publishes it', () => {
    it('puts an approved listing on every surface it belongs on', async () => {
      const res = await createListing().expect(201);
      await approveProduct(h, res.body.id);

      expect(await shopSlugs()).toContain(res.body.slug);
      await h.api().get(`${API_PREFIX}/products/${res.body.slug}`).expect(200);

      const storefront = await h.api().get(`${API_PREFIX}/vendors/${vendorSlug}/products`).expect(200);
      expect(storefront.body.map((p: { slug: string }) => p.slug)).toContain(res.body.slug);
    });
  });

  describe('hidden is not the same as pending', () => {
    it('keeps a taken-down listing resolvable by link but not buyable', async () => {
      /*
        These two states are both invisible and must not be collapsed. A
        `hidden` listing was public once, so a cart line, an order and a
        wishlist row already point at it and have to keep rendering — but
        nothing new may be bought. A `pending` one has never been public,
        so nothing legitimately references it and the link itself must
        fail.
      */
      const product = await createProduct(h, vendorId, categoryId, { moderationStatus: 'hidden' });
      const sku = (await h.prisma.weightOption.findFirstOrThrow({ where: { productId: product.id } })).sku;

      await h.api().get(`${API_PREFIX}/products/${product.slug}`).expect(200);
      expect(await shopSlugs()).not.toContain(product.slug);
      await h
        .api()
        .post(`${API_PREFIX}/cart/items`)
        .set(auth(buyer))
        .send({ productId: product.id, sku, quantity: 1 })
        .expect(404);
    });

    it('404s a rejected listing on a direct link, like a pending one', async () => {
      const product = await createProduct(h, vendorId, categoryId, { moderationStatus: 'rejected' });
      await h.api().get(`${API_PREFIX}/products/${product.slug}`).expect(404);
    });
  });

  describe('what an edit does to an approved listing', () => {
    const patch = (id: string, body: Record<string, unknown>) =>
      h.api().patch(`${API_PREFIX}/seller/listings/${id}`).set(auth(seller)).send(body);

    it('sends it back for review when the substance changes', async () => {
      // Otherwise approval is a one-time formality: list something
      // innocuous, get approved, then rewrite it into whatever you
      // actually wanted to sell.
      const product = await createProduct(h, vendorId, categoryId);
      await patch(product.id, { description: 'Actually something else entirely.' }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.moderationStatus).toBe('pending');
      expect(row.submittedAt).not.toBeNull();
    });

    it('leaves it live for a price change', async () => {
      /*
        The other failure, and the one that is easier to ship by accident.
        Re-queueing every edit means a kitchen correcting a typo or nudging
        a price goes dark until an admin gets to it, so editing becomes
        something you avoid — and stale listings are how a marketplace
        rots. A price rise is visible to the buyer who pays it; a swapped
        photo and description is not.
      */
      const product = await createProduct(h, vendorId, categoryId);
      await patch(product.id, { cashbackPct: 8 }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.moderationStatus).toBe('active');
    });

    it('lets a rejected listing be fixed and resubmitted, clearing the old reason', async () => {
      // A rejection with no route back is a dead listing, and the note
      // described a version that no longer exists.
      const product = await createProduct(h, vendorId, categoryId, { moderationStatus: 'rejected' });
      await h.prisma.product.update({
        where: { id: product.id },
        data: { moderationNote: 'Photo shows a branded wrapper.' },
      });

      await patch(product.id, { cashbackPct: 6 }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.moderationStatus).toBe('pending');
      expect(row.moderationNote).toBeNull();
    });

    it('does not let an edit jump the queue', async () => {
      // Editing a pending listing must not restamp `submittedAt`, or
      // repeatedly saving is a way to stay at the front of the queue.
      const created = await createListing().expect(201);
      const before = await h.prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });

      await patch(created.body.id, { description: 'Reworded while waiting.' }).expect(200);

      const after = await h.prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(after.moderationStatus).toBe('pending');
      expect(after.submittedAt?.getTime()).toBe(before.submittedAt?.getTime());
    });
  });

  describe('the admin decision', () => {
    let admin: Actor;

    beforeEach(async () => {
      admin = await createActor(h, 'admin');
    });

    const moderate = (id: string, body: Record<string, unknown>) =>
      h.api().patch(`${API_PREFIX}/admin/catalog/products/${id}/moderate`).set(auth(admin)).send(body);

    it('approves a pending listing and publishes it', async () => {
      const created = await createListing().expect(201);
      await moderate(created.body.id, { action: 'approve' }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.moderationStatus).toBe('active');
      expect(row.moderatedById).toBe(admin.userId);
      expect(row.moderatedAt).not.toBeNull();
      expect(await shopSlugs()).toContain(created.body.slug);
    });

    it('refuses to reject without a reason', async () => {
      /*
        The heart of the ask. Before M22 the DTO carried an action and
        nothing else, so there was no reason to omit — a listing could be
        hidden and its owner told neither that it happened nor why. A
        refusal the HomeKrafter cannot act on is a supplier lost for no
        stated cause.
      */
      const created = await createListing().expect(201);
      await moderate(created.body.id, { action: 'reject' }).expect(400);

      // Still pending — a refused refusal must not half-apply.
      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.moderationStatus).toBe('pending');
    });

    it('refuses a reason too short to act on', async () => {
      const created = await createListing().expect(201);
      await moderate(created.body.id, { action: 'reject', reason: 'no' }).expect(400);
    });

    it('stores the reason and tells the HomeKrafter, verbatim', async () => {
      const reason = 'The photo shows a branded wrapper — please use your own packaging.';
      const created = await createListing().expect(201);
      await moderate(created.body.id, { action: 'reject', reason }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.moderationStatus).toBe('rejected');
      expect(row.moderationNote).toBe(reason);

      // The reason has to survive the trip. Paraphrasing it in the
      // notification layer is how the one sentence that says what to
      // change gets lost.
      const sellerUserId = (
        await h.prisma.seller.findFirstOrThrow({ where: { vendorId }, select: { userId: true } })
      ).userId;
      // Polled, not read once: delivery is deliberately fire-and-forget
      // (a decision must not roll back because a message failed), so the
      // 200 is the wrong moment to look. Same reasoning as
      // `order-notifications.e2e-spec.ts#waitForNotifications`.
      const deadline = Date.now() + 20000;
      let delivered = false;
      while (Date.now() < deadline && !delivered) {
        const rows = await h.prisma.notification.findMany({ where: { userId: sellerUserId } });
        delivered = rows.some((n) => n.body.includes(reason));
        if (!delivered) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(delivered).toBe(true);
    });

    it('records the decision in the audit log, before and after', async () => {
      const created = await createListing().expect(201);
      await moderate(created.body.id, { action: 'reject', reason: 'Description is copied from another shop.' }).expect(200);

      const entry = await h.prisma.adminAuditLog.findFirstOrThrow({
        where: { action: 'product.reject', targetId: created.body.id },
      });
      expect(entry.actorId).toBe(admin.userId);
      expect(entry.metadata).toMatchObject({ from: 'pending', to: 'rejected' });
    });

    it('does not let featuring a listing erase why it was flagged', async () => {
      // `feature`/`unfeature` are merchandising, not moderation. Clearing
      // the note here would lose the reason because somebody put the item
      // on the home page.
      const product = await createProduct(h, vendorId, categoryId);
      await moderate(product.id, { action: 'flag', reason: 'Two buyers reported a stale batch.' }).expect(200);
      await moderate(product.id, { action: 'feature' }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.featured).toBe(true);
      expect(row.moderationStatus).toBe('flagged');
      expect(row.moderationNote).toBe('Two buyers reported a stale batch.');
    });

    it('clears the reason when the listing is allowed again', async () => {
      const product = await createProduct(h, vendorId, categoryId);
      await moderate(product.id, { action: 'hide', reason: 'Out of season, kitchen asked us to pull it.' }).expect(200);
      await moderate(product.id, { action: 'unhide' }).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.moderationStatus).toBe('active');
      expect(row.moderationNote).toBeNull();
    });

    it('puts the queue in front of the admin: pending first, oldest first', async () => {
      // A decided catalogue sorted newest-first buries the one thing this
      // screen exists to do. The listing waiting longest is the kitchen
      // waiting longest.
      const older = await createListing(listingBody({ name: 'Waiting longest' })).expect(201);
      const newer = await createListing(listingBody({ name: 'Waiting less' })).expect(201);
      await h.prisma.product.update({
        where: { id: older.body.id },
        data: { submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      });
      await createProduct(h, vendorId, categoryId, { name: 'Already live' });

      const list = await h
        .api()
        .get(`${API_PREFIX}/admin/catalog/products`)
        .set(auth(admin))
        .expect(200);
      const names = list.body.map((p: { name: string }) => p.name);
      expect(names.slice(0, 2)).toEqual(['Waiting longest', 'Waiting less']);
      expect(names).toContain('Already live');
      void newer;
    });
  });

  describe('the gate covers every catalogue, not just Product', () => {
    it('keeps a new meal plan off the public list until it is approved', async () => {
      // A kitchen refused a listing could otherwise publish the same thing
      // as a subscription plan, which would make the gate theatre.
      const product = await createProduct(h, vendorId, categoryId, { name: 'Tiffin base' });

      const created = await h
        .api()
        .post(`${API_PREFIX}/seller/meal-plans`)
        .set(auth(seller))
        .send({
          name: 'Everyday lunch',
          description: '2 rotis, dal, sabzi, rice and salad.',
          mealType: 'lunch',
          diet: 'veg',
          pricePerMeal: 120,
          productId: product.id,
        })
        .expect(201);

      const row = await h.prisma.mealPlan.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.moderationStatus).toBe('pending');
      expect(row.submittedAt).not.toBeNull();

      const list = await h.api().get(`${API_PREFIX}/meal-plans`).expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).not.toContain(created.body.id);
    });

    it('keeps a new menu item off the snacks menu until it is approved', async () => {
      /*
        The `Snack` table had no moderation column at all before M22 — the
        one catalogue on the platform an admin could not touch, sitting
        beside two that were gated.
      */
      const created = await h
        .api()
        .post(`${API_PREFIX}/seller/menu`)
        .set(auth(seller))
        .send({
          name: 'Masala mathri',
          description: 'Crisp, layered, fried in ghee.',
          price: 120,
          category: 'namkeen',
          diet: 'veg',
          available: true,
        })
        .expect(201);

      const row = await h.prisma.snack.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.moderationStatus).toBe('pending');

      const menu = await h.api().get(`${API_PREFIX}/snacks`).expect(200);
      expect(menu.body.map((s: { name: string }) => s.name)).not.toContain('Masala mathri');

      await h.prisma.snack.update({
        where: { id: created.body.id },
        data: { moderationStatus: 'active' },
      });
      const after = await h.api().get(`${API_PREFIX}/snacks`).expect(200);
      expect(after.body.map((s: { name: string }) => s.name)).toContain('Masala mathri');
    });
  });
});
