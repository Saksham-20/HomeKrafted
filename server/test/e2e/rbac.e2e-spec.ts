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
 * Three role surfaces in one app, gated by one guard pair. Every rule here
 * is enforced in exactly one place, which is efficient and means a single
 * regression opens all of it at once.
 *
 * Two distinct properties are being checked, and they fail differently:
 *
 * 1. **Role gating** — a consumer cannot reach `/seller/*` or `/admin/*`
 *    at all. Fails loudly, as a 403.
 * 2. **Row scoping** — a HomeKrafter authenticated perfectly correctly
 *    still cannot read or write *another kitchen's* rows. This is the one
 *    that fails silently: it needs no auth bug, just a query that forgot
 *    its `where`.
 */
describe('role gating and row scoping', () => {
  let h: Harness;
  let buyer: Actor;
  let seller: Actor;
  let admin: Actor;
  let otherSeller: Actor;
  let myListingId: string;
  let theirListingId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const category = await createCategory(h);

    const mine = await createKitchen(h, { name: 'My Kitchen' });
    seller = await createActor(h, 'seller', { sellerId: mine.seller.id });
    myListingId = (await createProduct(h, mine.vendor.id, category.id)).id;

    const theirs = await createKitchen(h, { name: 'Their Kitchen' });
    otherSeller = await createActor(h, 'seller', { sellerId: theirs.seller.id });
    theirListingId = (await createProduct(h, theirs.vendor.id, category.id)).id;

    buyer = await createActor(h);
    admin = await createActor(h, 'admin');
  });

  const SELLER_ROUTES = [
    '/seller/dashboard',
    '/seller/listings',
    '/seller/orders',
    '/seller/payouts',
    '/seller/analytics',
    '/seller/profile',
    '/seller/storefront',
  ];

  const ADMIN_ROUTES = [
    '/admin/sellers',
    '/admin/payouts',
    '/admin/settings',
    '/admin/catalog/reviews',
  ];

  describe('anonymous callers', () => {
    it.each([...SELLER_ROUTES, ...ADMIN_ROUTES])('is refused %s with a 401', async (route) => {
      await h.api().get(`${API_PREFIX}${route}`).expect(401);
    });

    it('can still browse the public catalogue', async () => {
      // The gate is on the portals, not on the shop. A visitor who never
      // signs in has to be able to shop.
      await h.api().get(`${API_PREFIX}/products`).expect(200);
      await h.api().get(`${API_PREFIX}/vendors`).expect(200);
      await h.api().get(`${API_PREFIX}/categories`).expect(200);
    });

    it('is refused a garbled token as firmly as no token', async () => {
      await h
        .api()
        .get(`${API_PREFIX}/seller/dashboard`)
        .set({ Authorization: 'Bearer not-a-real-token' })
        .expect(401);
    });
  });

  describe('a consumer', () => {
    it.each(SELLER_ROUTES)('is refused %s with a 403, not a 401', async (route) => {
      // 403, because they are authenticated — telling them to sign in
      // again would be a dead end.
      await h.api().get(`${API_PREFIX}${route}`).set(auth(buyer)).expect(403);
    });

    it.each(ADMIN_ROUTES)('is refused %s', async (route) => {
      await h.api().get(`${API_PREFIX}${route}`).set(auth(buyer)).expect(403);
    });
  });

  describe('a HomeKrafter', () => {
    it.each(ADMIN_ROUTES)('is refused the admin route %s', async (route) => {
      // The most valuable escalation on the platform: a seller reaching
      // admin would be able to verify themselves and settle their own
      // payouts.
      await h.api().get(`${API_PREFIX}${route}`).set(auth(seller)).expect(403);
    });

    it('reaches their own portal', async () => {
      for (const route of SELLER_ROUTES) {
        await h.api().get(`${API_PREFIX}${route}`).set(auth(seller)).expect(200);
      }
    });
  });

  describe('an admin', () => {
    it.each(ADMIN_ROUTES)('reaches %s', async (route) => {
      await h.api().get(`${API_PREFIX}${route}`).set(auth(admin)).expect(200);
    });

    it('does not get a seller portal by being an admin', async () => {
      // Admin is not a superset of seller: `/seller/*` resolves a seller
      // record, and an admin has none. Silently granting it would make
      // "whose kitchen is this" unanswerable.
      await h.api().get(`${API_PREFIX}/seller/dashboard`).set(auth(admin)).expect(403);
    });
  });

  describe('row scoping between two HomeKrafters', () => {
    it("cannot read another kitchen's listing", async () => {
      await h.api().get(`${API_PREFIX}/seller/listings/${theirListingId}`).set(auth(seller)).expect(404);
      await h.api().get(`${API_PREFIX}/seller/listings/${myListingId}`).set(auth(seller)).expect(200);
    });

    it("cannot edit another kitchen's listing", async () => {
      await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${theirListingId}`)
        .set(auth(seller))
        .send({ name: 'Renamed by a stranger' })
        .expect(404);

      const untouched = await h.prisma.product.findUnique({ where: { id: theirListingId } });
      expect(untouched!.name).not.toBe('Renamed by a stranger');
    });

    it("cannot delete another kitchen's listing", async () => {
      await h
        .api()
        .delete(`${API_PREFIX}/seller/listings/${theirListingId}`)
        .set(auth(seller))
        .expect(404);
      expect(await h.prisma.product.findUnique({ where: { id: theirListingId } })).toBeTruthy();
    });

    it("cannot flip another kitchen's availability", async () => {
      // The quietest one: a successful write here takes a stranger's
      // items off sale, and nothing in the product would report it.
      await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${theirListingId}/availability`)
        .set(auth(seller))
        .send({ isAvailable: false })
        .expect(404);
      expect((await h.prisma.product.findUnique({ where: { id: theirListingId } }))!.isAvailable).toBe(
        true,
      );
    });

    it('lists only their own listings', async () => {
      const res = await h.api().get(`${API_PREFIX}/seller/listings`).set(auth(seller)).expect(200);
      const ids = JSON.stringify(res.body);
      expect(ids).toContain(myListingId);
      expect(ids).not.toContain(theirListingId);
    });

    it('sees a different dashboard from the other kitchen', async () => {
      const mine = await h.api().get(`${API_PREFIX}/seller/listings`).set(auth(seller)).expect(200);
      const theirs = await h.api().get(`${API_PREFIX}/seller/listings`).set(auth(otherSeller)).expect(200);
      expect(JSON.stringify(mine.body)).not.toBe(JSON.stringify(theirs.body));
    });

    it("cannot cancel another kitchen's day off", async () => {
      const blackout = await h.prisma.vendorBlackoutDate.create({
        data: {
          vendorId: (await h.prisma.product.findUnique({ where: { id: theirListingId } }))!.vendorId,
          date: new Date('2026-12-25T00:00:00.000Z'),
          reason: 'Christmas',
        },
      });
      await h
        .api()
        .delete(`${API_PREFIX}/seller/profile/blackouts/${blackout.id}`)
        .set(auth(seller))
        .expect(200);
      // Scoped by `vendorId` in the filter, so a foreign id matches
      // nothing — the day off survives.
      expect(
        await h.prisma.vendorBlackoutDate.findUnique({ where: { id: blackout.id } }),
      ).toBeTruthy();
    });
  });

  describe('a promoted role needs a fresh token', () => {
    it('keeps the old role until the user signs in again', async () => {
      // Role lives in the JWT claims. This is not a bug to fix — it is the
      // trade the design makes, and an operator promoting someone who is
      // already signed in needs to know it.
      const promoted = await createActor(h);
      await h.prisma.user.update({ where: { id: promoted.userId }, data: { role: 'admin' } });
      await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(promoted)).expect(403);
    });
  });
});
