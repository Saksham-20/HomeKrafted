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
  errorOf,
  resetDatabase,
} from './harness';

/**
 * Merchandising is an admin's call (owner, 2026-09-19): the badges on a
 * card (`Product.tags`) and which listings lead the browse
 * (`featured` + `featuredRank`).
 *
 * Two halves, and each one fails silently:
 *
 * 1. **A seller cannot badge their own work.** The DTO still accepts
 *    `tags` — a removed field would 400 every web bundle and native build
 *    already shipped — so the guarantee is that the *write* ignores it.
 *    That is invisible from the response of a request that succeeds, which
 *    is why it is asserted against the row.
 * 2. **The featured list is a full replacement in one transaction**, and
 *    it is merchandising, not moderation: it must never touch a listing's
 *    review note.
 *
 * The browse-order half (featured listings lead, in rank order, on both
 * code paths) lives in `products-browse.e2e-spec.ts`, next to the
 * equivalence test it extends.
 */
describe('admin merchandising', () => {
  let h: Harness;
  let admin: Actor;
  let seller: Actor;
  let vendorId: string;
  let categoryId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h);
    const kitchen = await createKitchen(h);
    vendorId = kitchen.vendor.id;
    seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
    admin = await createActor(h, 'admin');
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

  const sellerCreates = (body: Record<string, unknown>) =>
    h.api().post(`${API_PREFIX}/seller/listings`).set(auth(seller)).send(body);
  const sellerPatches = (id: string, body: Record<string, unknown>) =>
    h.api().patch(`${API_PREFIX}/seller/listings/${id}`).set(auth(seller)).send(body);
  const adminCreates = (body: Record<string, unknown>) =>
    h.api().post(`${API_PREFIX}/admin/catalog/products`).set(auth(admin)).send({ vendorId, ...body });
  const adminPatches = (id: string, body: Record<string, unknown>) =>
    h.api().patch(`${API_PREFIX}/admin/catalog/products/${id}`).set(auth(admin)).send(body);
  const tagsOf = async (id: string) =>
    (await h.prisma.product.findUniqueOrThrow({ where: { id }, select: { tags: true } })).tags;

  describe('badges (Product.tags) are admin-only', () => {
    it('a seller creating a listing with tags stores none', async () => {
      const res = await sellerCreates(
        listingBody({ tags: ['Bestseller', 'Curated'] }),
      ).expect(201);

      // Accepted (201, not 400) and ignored: refusing would break every
      // client that posts `tags` on each save.
      expect(await tagsOf(res.body.id)).toEqual([]);
      expect(res.body.tags).toEqual([]);
    });

    it('a seller editing a listing cannot add a badge', async () => {
      const created = await sellerCreates(listingBody()).expect(201);

      await sellerPatches(created.body.id, { tags: ['Festive'] }).expect(200);

      expect(await tagsOf(created.body.id)).toEqual([]);
    });

    it('a seller save leaves an admin-set badge exactly as it was', async () => {
      // The realistic case: every seller save posts the form's `tags`
      // back. If the server honoured that, the badge an admin set would be
      // wiped the next time the maker edited a price.
      const listing = await adminCreates(listingBody({ tags: ['Bestseller', 'New'] })).expect(201);
      expect(await tagsOf(listing.body.id)).toEqual(['Bestseller', 'New']);

      await sellerPatches(listing.body.id, { tags: [], description: 'Now with a lid.' }).expect(200);
      expect(await tagsOf(listing.body.id)).toEqual(['Bestseller', 'New']);

      await sellerPatches(listing.body.id, { tags: ['Curated'] }).expect(200);
      expect(await tagsOf(listing.body.id)).toEqual(['Bestseller', 'New']);

      // The rest of the edit still landed, so this is "ignored", not
      // "the whole save was dropped".
      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: listing.body.id } });
      expect(row.description).toBe('Now with a lid.');
    });

    it('an admin can set, change and clear badges', async () => {
      const listing = await adminCreates(listingBody({ tags: ['Festive'] })).expect(201);
      expect(await tagsOf(listing.body.id)).toEqual(['Festive']);

      await adminPatches(listing.body.id, { tags: ['Curated', 'New'] }).expect(200);
      expect(await tagsOf(listing.body.id)).toEqual(['Curated', 'New']);

      // An edit that does not mention `tags` leaves them.
      await adminPatches(listing.body.id, { description: 'Quietly reworded.' }).expect(200);
      expect(await tagsOf(listing.body.id)).toEqual(['Curated', 'New']);

      // An explicit empty list is a real answer: remove the badges.
      await adminPatches(listing.body.id, { tags: [] }).expect(200);
      expect(await tagsOf(listing.body.id)).toEqual([]);
    });

    it('still refuses a badge nobody has heard of', async () => {
      // The DTO's allowlist is untouched — only the write changed.
      await adminCreates(listingBody({ tags: ['Cheapest'] })).expect(400);
    });
  });

  describe('the featured list', () => {
    const putFeatured = (productIds: unknown, actor: Actor = admin) =>
      h.api().put(`${API_PREFIX}/admin/catalog/featured`).set(auth(actor)).send({ productIds });
    const getFeatured = (actor: Actor = admin) =>
      h.api().get(`${API_PREFIX}/admin/catalog/featured`).set(auth(actor));
    const idsOf = (res: { body: { items: { id: string }[] } }) => res.body.items.map((p) => p.id);

    async function threeListings() {
      const a = await createProduct(h, vendorId, categoryId, { name: 'Amber' });
      const b = await createProduct(h, vendorId, categoryId, { name: 'Basil' });
      const c = await createProduct(h, vendorId, categoryId, { name: 'Cedar' });
      return { a: a.id, b: b.id, c: c.id };
    }

    it('ranks by array position, starting at 1', async () => {
      const { a, b, c } = await threeListings();

      const res = await putFeatured([c, a]).expect(200);

      expect(idsOf(res)).toEqual([c, a]);
      const rows = await h.prisma.product.findMany({
        where: { id: { in: [a, b, c] } },
        select: { id: true, featured: true, featuredRank: true },
      });
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[c]).toMatchObject({ featured: true, featuredRank: 1 });
      expect(byId[a]).toMatchObject({ featured: true, featuredRank: 2 });
      expect(byId[b]).toMatchObject({ featured: false, featuredRank: null });
    });

    it('is a full replacement: a listing left out is unfeatured and loses its rank', async () => {
      const { a, b, c } = await threeListings();
      await putFeatured([a, b, c]).expect(200);

      const res = await putFeatured([b]).expect(200);

      expect(idsOf(res)).toEqual([b]);
      const rows = await h.prisma.product.findMany({
        where: { id: { in: [a, c] } },
        select: { featured: true, featuredRank: true },
      });
      expect(rows).toEqual([
        { featured: false, featuredRank: null },
        { featured: false, featuredRank: null },
      ]);
      // And the one that stayed was renumbered from 1, not left at 2.
      const kept = await h.prisma.product.findUniqueOrThrow({ where: { id: b } });
      expect(kept.featuredRank).toBe(1);
    });

    it('an empty list features nothing', async () => {
      const { a, b } = await threeListings();
      await putFeatured([a, b]).expect(200);

      const res = await putFeatured([]).expect(200);

      expect(res.body.items).toEqual([]);
      expect(await h.prisma.product.count({ where: { featured: true } })).toBe(0);
    });

    it('collapses a duplicate to its first position', async () => {
      const { a, b } = await threeListings();

      const res = await putFeatured([a, b, a]).expect(200);

      expect(idsOf(res)).toEqual([a, b]);
      expect((await h.prisma.product.findUniqueOrThrow({ where: { id: b } })).featuredRank).toBe(2);
    });

    it('refuses an id that does not exist, names it, and writes nothing', async () => {
      const { a, b } = await threeListings();
      await putFeatured([b]).expect(200);

      const res = await putFeatured([a, 'nope-not-a-listing']).expect(400);

      expect(errorOf(res).message).toContain('nope-not-a-listing');
      // The refusal came before the transaction, so the previous list —
      // and `a`, which the refused list would have featured — is untouched.
      expect(await h.prisma.product.count({ where: { featured: true } })).toBe(1);
      expect((await h.prisma.product.findUniqueOrThrow({ where: { id: a } })).featured).toBe(false);
    });

    it('refuses a list longer than 100', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
      await putFeatured(ids).expect(400);
    });

    it('refuses a body that is not a list of strings', async () => {
      await putFeatured('abc').expect(400);
      await putFeatured([1, 2]).expect(400);
      await h.api().put(`${API_PREFIX}/admin/catalog/featured`).set(auth(admin)).send({}).expect(400);
    });

    it('is merchandising, not moderation: a flagged listing keeps the reason it was flagged', async () => {
      const { a } = await threeListings();
      const reason = 'Two buyers reported a stale batch.';
      await h.prisma.product.update({
        where: { id: a },
        data: { moderationStatus: 'flagged', moderationNote: reason, moderatedAt: new Date(0) },
      });

      await putFeatured([a]).expect(200);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: a } });
      expect(row.moderationStatus).toBe('flagged');
      expect(row.moderationNote).toBe(reason);
      expect(row.moderatedAt?.getTime()).toBe(0);
    });

    describe('a stale list (basedOn)', () => {
      const putBasedOn = (productIds: string[], basedOn: string[]) =>
        h.api().put(`${API_PREFIX}/admin/catalog/featured`).set(auth(admin)).send({ productIds, basedOn });

      it('refuses a save that would unfeature a listing featured since the screen loaded, naming it, and writes nothing', async () => {
        const { a, b, c } = await threeListings();
        await putFeatured([a, b]).expect(200);
        // Admin A opened the screen here: [a, b]. Then admin B, on the
        // Products tab, features Cedar — unranked.
        await h.prisma.product.update({ where: { id: c }, data: { featured: true } });

        const res = await putBasedOn([b, a], [a, b]).expect(409);

        expect(errorOf(res).message).toContain('Cedar');
        expect(errorOf(res).message).toContain('unfeature');
        // Nothing moved: Cedar is still featured, and the order is untouched.
        const cedar = await h.prisma.product.findUniqueOrThrow({ where: { id: c } });
        expect(cedar.featured).toBe(true);
        const ranks = await h.prisma.product.findMany({
          where: { id: { in: [a, b] } },
          select: { id: true, featuredRank: true },
        });
        expect(Object.fromEntries(ranks.map((r) => [r.id, r.featuredRank]))).toEqual({ [a]: 1, [b]: 2 });
      });

      it('lets the same save through once the newer listing is in the list', async () => {
        const { a, b, c } = await threeListings();
        await putFeatured([a, b]).expect(200);
        await h.prisma.product.update({ where: { id: c }, data: { featured: true } });

        // The admin reloaded, saw Cedar, and kept it.
        const res = await putBasedOn([b, a, c], [a, b, c]).expect(200);

        expect(idsOf(res)).toEqual([b, a, c]);
      });

      it('does not refuse removing a listing the admin actually saw', async () => {
        const { a, b } = await threeListings();
        await putFeatured([a, b]).expect(200);

        const res = await putBasedOn([b], [a, b]).expect(200);

        expect(idsOf(res)).toEqual([b]);
        expect((await h.prisma.product.findUniqueOrThrow({ where: { id: a } })).featured).toBe(false);
      });

      it('is optional: a client that never sends it keeps the unconditional replacement', async () => {
        const { a, b, c } = await threeListings();
        await putFeatured([a, b]).expect(200);
        await h.prisma.product.update({ where: { id: c }, data: { featured: true } });

        await putFeatured([b, a]).expect(200);

        expect((await h.prisma.product.findUniqueOrThrow({ where: { id: c } })).featured).toBe(false);
      });

      it('refuses a basedOn that is not a list of strings', async () => {
        const { a } = await threeListings();
        await h.api().put(`${API_PREFIX}/admin/catalog/featured`).set(auth(admin)).send({ productIds: [a], basedOn: 'abc' }).expect(400);
      });
    });

    it('is audited with the before and after lists', async () => {
      const { a, b, c } = await threeListings();
      await putFeatured([a, b]).expect(200);
      await putFeatured([c, a]).expect(200);

      const entries = await h.prisma.adminAuditLog.findMany({
        where: { action: 'catalog.featured_set' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries).toHaveLength(2);
      expect(entries[1].actorId).toBe(admin.userId);
      expect(entries[1].metadata).toEqual({ before: [a, b], after: [c, a] });
    });

    it('GET lists the unranked in the order buyers get them — by rating, not by name', async () => {
      const { a, b, c } = await threeListings();
      // Two unranked, 'Amber' (3.0) and 'Basil' (5.0), and one ranked. By
      // name the screen read Amber first; buyers get Basil first, and the
      // screen's position badges have to say what buyers see.
      await h.prisma.product.update({ where: { id: a }, data: { featured: true, rating: 3 } });
      await h.prisma.product.update({ where: { id: b }, data: { featured: true, rating: 5 } });
      await h.prisma.product.update({ where: { id: c }, data: { featured: true, featuredRank: 1 } });

      const res = await getFeatured().expect(200);

      expect(idsOf(res)).toEqual([c, b, a]);

      // The same three, in the public default browse.
      const browse = await h.api().get(`${API_PREFIX}/products?pageSize=50`).expect(200);
      const publicOrder = (browse.body.items as { id: string }[])
        .map((p) => p.id)
        .filter((id) => [a, b, c].includes(id));
      expect(publicOrder).toEqual(idsOf(res));
    });

    it('GET lists ranked listings first, then the unranked', async () => {
      const { a, b, c } = await threeListings();
      // `feature` (the moderation route's toggle) leaves the rank NULL.
      await h.prisma.product.update({ where: { id: a }, data: { featured: true } });
      await h.prisma.product.update({ where: { id: b }, data: { featured: true, featuredRank: 2 } });
      await h.prisma.product.update({ where: { id: c }, data: { featured: true, featuredRank: 1 } });

      const res = await getFeatured().expect(200);

      // c (1), b (2), then the unranked a.
      expect(idsOf(res)).toEqual([c, b, a]);
      expect(res.body.total).toBe(3);
      expect(res.body.items[0]).toMatchObject({
        id: c,
        featuredRank: 1,
        vendorName: 'Test Kitchen',
        categoryName: 'Pickles',
      });
      expect(res.body.items[2].featuredRank).toBeNull();
    });

    it('GET includes a featured listing that is no longer live, so it can be taken out', async () => {
      const { a } = await threeListings();
      await putFeatured([a]).expect(200);
      await h.prisma.product.update({ where: { id: a }, data: { moderationStatus: 'hidden' } });

      const res = await getFeatured().expect(200);

      expect(idsOf(res)).toEqual([a]);
      expect(res.body.items[0].moderationStatus).toBe('hidden');
    });

    describe('the toggle on the moderation route, with ranks', () => {
      const moderate = (id: string, action: 'feature' | 'unfeature') =>
        h
          .api()
          .patch(`${API_PREFIX}/admin/catalog/products/${id}/moderate`)
          .set(auth(admin))
          .send({ action });

      it('unfeature clears the rank, so a re-feature does not resurrect a stale place', async () => {
        const { a } = await threeListings();
        await putFeatured([a]).expect(200);

        await moderate(a, 'unfeature').expect(200);
        let row = await h.prisma.product.findUniqueOrThrow({ where: { id: a } });
        expect(row).toMatchObject({ featured: false, featuredRank: null });

        await moderate(a, 'feature').expect(200);
        row = await h.prisma.product.findUniqueOrThrow({ where: { id: a } });
        expect(row).toMatchObject({ featured: true, featuredRank: null });
      });

      it('feature leaves an existing rank alone', async () => {
        const { a } = await threeListings();
        await h.prisma.product.update({ where: { id: a }, data: { featured: true, featuredRank: 4 } });

        await moderate(a, 'feature').expect(200);

        const row = await h.prisma.product.findUniqueOrThrow({ where: { id: a } });
        expect(row.featuredRank).toBe(4);
      });
    });

    describe('who may call it', () => {
      it('refuses a signed-out caller', async () => {
        await h.api().get(`${API_PREFIX}/admin/catalog/featured`).expect(401);
        await h.api().put(`${API_PREFIX}/admin/catalog/featured`).send({ productIds: [] }).expect(401);
      });

      it('refuses a buyer and a HomeKrafter', async () => {
        const buyer = await createActor(h, 'consumer');
        for (const actor of [buyer, seller]) {
          await getFeatured(actor).expect(403);
          await putFeatured([], actor).expect(403);
        }
      });

      it('refuses an admin without the catalog section, on both routes', async () => {
        const limited = await createActor(h, 'admin');
        await h.prisma.user.update({ where: { id: limited.userId }, data: { adminScopes: ['orders'] } });

        const read = await getFeatured(limited).expect(403);
        expect(errorOf(read).message).toMatch(/catalog/);
        await putFeatured([], limited).expect(403);
      });

      it('admits an admin who has only the catalog section', async () => {
        const catalogOnly = await createActor(h, 'admin');
        await h.prisma.user.update({ where: { id: catalogOnly.userId }, data: { adminScopes: ['catalog'] } });

        await getFeatured(catalogOnly).expect(200);
        await putFeatured([], catalogOnly).expect(200);
      });
    });
  });
});
