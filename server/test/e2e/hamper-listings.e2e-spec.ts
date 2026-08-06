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
 * Gift hampers as listings (M18).
 *
 * The buyer-assembled builder is gone; a hamper is now a `Product` a
 * HomeKrafter marks as one. That decision is only sound if the flag really
 * is *just* a filter — the moment it starts deciding anything else, the
 * "a hamper is an ordinary listing" claim stops being true and the
 * duplication the builder had comes back.
 *
 * So these tests pin two things: the filter has three states rather than
 * two, and a hamper stays in every catalogue it would otherwise be in.
 */
describe('hamper listings', () => {
  let h: Harness;
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
    await resetDatabase(h.prisma);
    const kitchen = await createKitchen(h);
    vendorId = kitchen.vendor.id;
    seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
    categoryId = (await createCategory(h)).id;
  });

  const listProducts = (query = '') => h.api().get(`${API_PREFIX}/products${query}`);

  const slugsOf = (body: { items: { slug: string }[] }) => body.items.map((p) => p.slug);

  describe('the filter', () => {
    it('returns only hampers for isHamper=true', async () => {
      const ordinary = await createProduct(h, vendorId, categoryId);
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({ where: { id: hamper.id }, data: { isHamper: true } });

      const res = await listProducts('?isHamper=true').expect(200);
      expect(slugsOf(res.body)).toEqual([hamper.slug]);
      expect(slugsOf(res.body)).not.toContain(ordinary.slug);
    });

    it('returns only non-hampers for isHamper=false', async () => {
      // Three states, not two. A caller that wants a catalogue without
      // hampers in it can say so — which is the difference between a
      // filter and a hardcoded page.
      const ordinary = await createProduct(h, vendorId, categoryId);
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({ where: { id: hamper.id }, data: { isHamper: true } });

      const res = await listProducts('?isHamper=false').expect(200);
      expect(slugsOf(res.body)).toEqual([ordinary.slug]);
    });

    it('returns both when the filter is omitted', async () => {
      // The rule that makes a hamper an ordinary listing: it does not
      // vanish from `/shop`, search, or a category page. Hiding it there
      // would cost the HomeKrafter sales for ticking a box.
      const ordinary = await createProduct(h, vendorId, categoryId);
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({ where: { id: hamper.id }, data: { isHamper: true } });

      const res = await listProducts().expect(200);
      expect(slugsOf(res.body).sort()).toEqual([hamper.slug, ordinary.slug].sort());
    });

    it('reads the string "false" as false, not as true', async () => {
      // The `@BooleanField()` rule. With a bare `@IsBoolean()`, the global
      // pipe's implicit conversion reads `"false"` as `true`, which would
      // make `?isHamper=false` return only hampers.
      const ordinary = await createProduct(h, vendorId, categoryId);
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({ where: { id: hamper.id }, data: { isHamper: true } });

      const res = await listProducts('?isHamper=false').expect(200);
      expect(slugsOf(res.body)).toEqual([ordinary.slug]);
    });

    it('leaves an ordinary listing unflagged by default', async () => {
      const product = await createProduct(h, vendorId, categoryId);
      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.isHamper).toBe(false);
    });
  });

  describe('a HomeKrafter marks their own', () => {
    const listingBody = (overrides: Record<string, unknown> = {}) => ({
      name: 'Diwali gift hamper',
      categoryId,
      description: 'Six of my best jars, boxed and wrapped.',
      isPackaged: true,
      cashbackPct: 5,
      weightOptions: [{ sku: `hamper-${Date.now()}`, label: 'One box', price: 1499, mrp: 1750, stock: 10 }],
      defaultWeightSku: `hamper-${Date.now()}`,
      ...overrides,
    });

    it('creates a hamper when the flag is set', async () => {
      const sku = `hamper-sku-${Date.now()}`;
      const res = await h
        .api()
        .post(`${API_PREFIX}/seller/listings`)
        .set(auth(seller))
        .send(
          listingBody({
            isHamper: true,
            weightOptions: [{ sku, label: 'One box', price: 1499, mrp: 1750, stock: 10 }],
            defaultWeightSku: sku,
          }),
        )
        .expect(201);

      expect(res.body.isHamper).toBe(true);
      // M22: a new listing is `pending`, so it is deliberately not on the
      // public catalogue until an admin approves it. This assertion is
      // about `?isHamper=true` filtering, not about the review gate.
      await approveProduct(h, res.body.id);
      expect(slugsOf((await listProducts('?isHamper=true').expect(200)).body)).toEqual([
        res.body.slug,
      ]);
    });

    it('creates an ordinary listing when the flag is absent', async () => {
      // Optional field, and its absence must mean "no" rather than a 400 —
      // every caller written before M18 omits it.
      const sku = `plain-sku-${Date.now()}`;
      const res = await h
        .api()
        .post(`${API_PREFIX}/seller/listings`)
        .set(auth(seller))
        .send(
          listingBody({
            weightOptions: [{ sku, label: '250 g', price: 250, mrp: 250, stock: 10 }],
            defaultWeightSku: sku,
          }),
        )
        .expect(201);

      expect(res.body.isHamper).toBe(false);
    });

    it('can flip an existing listing either way', async () => {
      const product = await createProduct(h, vendorId, categoryId);

      const on = await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${product.id}`)
        .set(auth(seller))
        .send({ isHamper: true })
        .expect(200);
      expect(on.body.isHamper).toBe(true);

      const off = await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${product.id}`)
        .set(auth(seller))
        .send({ isHamper: false })
        .expect(200);
      expect(off.body.isHamper).toBe(false);
    });

    it("cannot flag another kitchen's listing", async () => {
      // The flag is a listing attribute, so it inherits listing ownership.
      // Worth pinning: a hamper page is a merchandising surface, and
      // putting your own name on somebody else's product is the reason to
      // try.
      const other = await createKitchen(h, { name: 'Other Kitchen' });
      const theirs = await createProduct(h, other.vendor.id, categoryId);

      await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${theirs.id}`)
        .set(auth(seller))
        .send({ isHamper: true })
        .expect(404);

      const row = await h.prisma.product.findUniqueOrThrow({ where: { id: theirs.id } });
      expect(row.isHamper).toBe(false);
    });

    it('refuses an anonymous attempt to flag anything', async () => {
      const product = await createProduct(h, vendorId, categoryId);
      await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${product.id}`)
        .send({ isHamper: true })
        .expect(401);
    });
  });

  describe('a hamper is an ordinary listing in every other way', () => {
    it('stays hidden when the HomeKrafter marks it unavailable', async () => {
      // `isHamper` must not become a second visibility switch. Availability
      // and moderation still decide whether a buyer sees it.
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({
        where: { id: hamper.id },
        data: { isHamper: true, isAvailable: false },
      });

      const res = await listProducts('?isHamper=true&availableOnly=true').expect(200);
      expect(slugsOf(res.body)).toEqual([]);
    });

    it('stays hidden when an admin hides it', async () => {
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({
        where: { id: hamper.id },
        data: { isHamper: true, moderationStatus: 'hidden' },
      });

      const res = await listProducts('?isHamper=true').expect(200);
      expect(slugsOf(res.body)).toEqual([]);
    });

    it('is reachable at its own product page like anything else', async () => {
      const hamper = await createProduct(h, vendorId, categoryId);
      await h.prisma.product.update({ where: { id: hamper.id }, data: { isHamper: true } });

      const res = await h.api().get(`${API_PREFIX}/products/${hamper.slug}`).expect(200);
      expect(res.body.isHamper).toBe(true);
    });
  });
});
