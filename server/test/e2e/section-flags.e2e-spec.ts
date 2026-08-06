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
  resetDatabase,
} from './harness';

/**
 * The M20 section flags, written by the people who own them.
 *
 * `kind`, `shippingScope` and `isSnack` all shipped on `Product` with
 * readers and **no write path** — nothing but a direct database edit could
 * set them, so `/gifts` was live and permanently empty and the snacks flag
 * was decoration. These tests pin the write path, because "the column
 * exists" and "a HomeKrafter can use it" turned out to be different claims.
 *
 * The `isHamper` suite next door pins the sibling rule: a flag is *just* a
 * filter, and a flagged listing stays in every catalogue it would
 * otherwise be in.
 */
describe('M20 section flags', () => {
  let h: Harness;
  let seller: Actor;
  let vendorId: string;
  let foodCategoryId: string;
  let craftCategoryId: string;

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
    foodCategoryId = (await createCategory(h)).id;
    const craftCategory = await createCategory(h);
    await h.prisma.category.update({
      where: { id: craftCategory.id },
      data: { group: 'craft' },
    });
    craftCategoryId = craftCategory.id;
  });

  /** The minimum `CreateListingDto` accepts, plus whatever is under test. */
  function listingBody(overrides: Record<string, unknown> = {}) {
    const sku = `sku-${Math.random().toString(36).slice(2, 10)}`;
    return {
      name: 'Sandalwood soy candle',
      categoryId: craftCategoryId,
      description: 'Hand-poured, about forty hours of burn.',
      isPackaged: true,
      cashbackPct: 5,
      weightOptions: [{ sku, label: 'Single', price: 640, mrp: 750, stock: 24 }],
      defaultWeightSku: sku,
      ...overrides,
    };
  }

  const createListing = (body: Record<string, unknown>) =>
    h.api().post(`${API_PREFIX}/seller/listings`).set(auth(seller)).send(body);

  /**
   * Create a listing and approve it, the way an admin would.
   *
   * Since M22 a new listing is `pending` and deliberately absent from
   * every public catalogue. These specs are about section *filtering* —
   * `kind`, `shippingScope`, `isSnack` — so they need a listing that is
   * actually published; the review gate has its own spec
   * (`catalog-moderation.e2e-spec.ts`).
   */
  async function createLiveListing(body: Record<string, unknown>) {
    const res = await createListing(body).expect(201);
    await approveProduct(h, res.body.id);
    return res;
  }

  describe('kind', () => {
    it('lets a maker create a craft, and it shows on the gifts catalogue', async () => {
      const res = await createLiveListing(listingBody({ kind: 'craft' }));
      expect(res.body.kind).toBe('craft');

      const gifts = await h.api().get(`${API_PREFIX}/products?kind=craft`).expect(200);
      expect(gifts.body.items.map((p: { slug: string }) => p.slug)).toEqual([res.body.slug]);
    });

    it('defaults to food when the field is absent', async () => {
      // Every listing predating M20 was food, and an old client that sends
      // no `kind` must keep meaning that rather than failing validation.
      const res = await createListing(
        listingBody({ categoryId: foodCategoryId, name: 'Mango thokku' }),
      ).expect(201);
      expect(res.body.kind).toBe('food');
    });

    it('keeps the two verticals apart', async () => {
      const craft = await createLiveListing(listingBody({ kind: 'craft' }));
      const food = await createLiveListing(
        listingBody({ categoryId: foodCategoryId, name: 'Mango thokku' }),
      );

      const gifts = await h.api().get(`${API_PREFIX}/products?kind=craft`).expect(200);
      const slugs = gifts.body.items.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(craft.body.slug);
      expect(slugs).not.toContain(food.body.slug);
    });

    it('refuses a kind that is not one of the two', async () => {
      await createListing(listingBody({ kind: 'service' })).expect(400);
    });
  });

  describe('shippingScope', () => {
    it('shows a national listing to a buyer far outside the delivery radius', async () => {
      /*
        The rule that makes the gifts vertical work: `national` skips the
        radius gate entirely. Deriving this from `kind` would forbid a
        kitchen posting pickles across India, which is why it is its own
        column.
      */
      const national = await createLiveListing(
        listingBody({ kind: 'craft', shippingScope: 'national' }),
      );
      const local = await createLiveListing(
        listingBody({ kind: 'craft', shippingScope: 'local', name: 'Stoneware mugs' }),
      );

      // Mumbai — roughly 1,500km from the tricity, far outside any radius.
      const res = await h
        .api()
        .get(`${API_PREFIX}/products?kind=craft&lat=19.076&lng=72.8777`)
        .expect(200);

      const slugs = res.body.items.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(national.body.slug);
      expect(slugs).not.toContain(local.body.slug);
    });

    it('defaults to local', async () => {
      const res = await createListing(listingBody({ kind: 'craft' })).expect(201);
      expect(res.body.shippingScope).toBe('local');
    });
  });

  describe('isSnack', () => {
    it('puts a listing on the snacks menu without taking it out of the shop', async () => {
      // The whole point of a capability flag over a table per section: the
      // listing is in both places, priced and moderated once.
      const res = await createLiveListing(
        listingBody({ categoryId: foodCategoryId, name: 'Masala mathri', isSnack: true }),
      );

      const snacks = await h.api().get(`${API_PREFIX}/snacks`).expect(200);
      expect(snacks.body.some((s: { name: string }) => s.name === 'Masala mathri')).toBe(true);

      const shop = await h.api().get(`${API_PREFIX}/products`).expect(200);
      expect(shop.body.items.map((p: { slug: string }) => p.slug)).toContain(res.body.slug);
    });

    it('reads the string "false" as false, not as true', async () => {
      /*
        `@BooleanField()` rather than a bare `@IsBoolean()`. The global
        pipe's `enableImplicitConversion` turns any non-empty string into
        `true`, which would put every listing on the snacks menu.
      */
      const res = await createListing(
        listingBody({ categoryId: foodCategoryId, isSnack: 'false' }),
      ).expect(201);
      expect(res.body.isSnack).toBe(false);
    });
  });

  describe('the category taxonomy', () => {
    it('tells a client which side of the catalogue each category is on', async () => {
      /*
        `group` and `sortOrder` were columns from the day the gifts
        vertical shipped and were never returned by the API. The client
        resolves an absent `group` to `food`, so the seller form's craft
        category picker was permanently **empty** — a HomeKrafter could
        choose "Handcrafted gift" and then had nothing to file it under.
        Found on production, not by reading the code.
      */
      const res = await h.api().get(`${API_PREFIX}/categories`).expect(200);
      const rows: { id: string; group: string; sortOrder: number }[] = res.body;

      const craft = rows.find((c) => c.id === craftCategoryId);
      const food = rows.find((c) => c.id === foodCategoryId);
      expect(craft?.group).toBe('craft');
      expect(food?.group).toBe('food');
      expect(typeof craft?.sortOrder).toBe('number');
    });

    it('orders by sortOrder before name', async () => {
      // The schema documents `sortOrder` as what drives the home page
      // tiles; ordering by name alone silently ignored it.
      await h.prisma.category.update({
        where: { id: craftCategoryId },
        data: { sortOrder: -5, name: 'Zzz last alphabetically' },
      });
      const res = await h.api().get(`${API_PREFIX}/categories`).expect(200);
      expect(res.body[0].id).toBe(craftCategoryId);
    });
  });

  describe('what a seller still cannot set', () => {
    it('refuses an attempt to set its own moderation status', async () => {
      // `forbidNonWhitelisted`. The admin's switch stays the admin's — the
      // same rule that stops a seller awarding themselves a badge (M16).
      await createListing(listingBody({ moderationStatus: 'active' })).expect(400);
    });
  });
});
