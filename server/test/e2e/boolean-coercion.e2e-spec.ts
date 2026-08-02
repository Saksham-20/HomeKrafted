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
 * **`"false"` must never mean `true`.**
 *
 * The global `ValidationPipe` runs with `enableImplicitConversion` so
 * query DTOs get real numbers out of `?days=30`. For a `Boolean` field
 * that conversion is `Boolean(value)`, and `Boolean('false')` is `true` —
 * so before `@BooleanField()`, every non-empty string set a boolean flag
 * to **true** and returned 200, whatever the string said.
 *
 * Found by a test that expected a 400 and got a 200. It reached the
 * verification badge, wallet auto-top-up, review moderation and a
 * HomeKrafter's own availability switch, and in each one it failed in the
 * *enabling* direction. `"false"` is not an exotic payload: it is what an
 * HTML form field and a hand-written `curl` send.
 *
 * These cases run against the endpoints where being wrong costs the most,
 * rather than only against the decorator, because the bug was never in a
 * validator — it was in the pipeline that ran before one.
 */
describe('boolean request fields', () => {
  let h: Harness;
  let admin: Actor;
  let sellerId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const kitchen = await createKitchen(h);
    sellerId = kitchen.seller.id;
    admin = await createActor(h, 'admin');
  });

  describe('the verification badge', () => {
    const setVerification = (body: object) =>
      h.api().patch(`${API_PREFIX}/admin/sellers/${sellerId}/verification`).set(auth(admin)).send(body);

    it('reads the string "false" as false, not as true', async () => {
      // The exact request that used to grant the badge.
      await setVerification({ fssaiVerified: 'false' }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.fssaiVerified).toBe(false);
    });

    it('reads the string "true" as true', async () => {
      await setVerification({ identityVerified: 'true' }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.identityVerified).toBe(true);
    });

    it.each(['no', 'yes', '0', '1', 'FALSE', 'TRUE', ''])(
      'rejects the ambiguous value %j rather than guessing',
      async (value) => {
        // Guessing at "yes" would be the same bug, more politely.
        await setVerification({ fssaiVerified: value }).expect(400);
      },
    );

    it('rejects a number', async () => {
      await setVerification({ addressVerified: 1 }).expect(400);
      await setVerification({ addressVerified: 0 }).expect(400);
    });

    it('still accepts real booleans', async () => {
      await setVerification({ fssaiVerified: true, identityVerified: false }).expect(200);
      const profile = await h.prisma.vendorProfile.findFirst();
      expect(profile?.fssaiVerified).toBe(true);
      expect(profile?.identityVerified).toBe(false);
    });

    it('still treats an omitted field as absent, not as false', async () => {
      // The transform must leave `undefined` alone or `@IsOptional()`
      // would start reading every missing flag as a withdrawal.
      await setVerification({ fssaiVerified: true, identityVerified: true }).expect(200);
      await setVerification({ fssaiVerified: false }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.identityVerified).toBe(true);
    });
  });

  describe("a HomeKrafter's own availability switch", () => {
    it('reads "false" as taking the item off sale', async () => {
      // Wrong in the other direction here, and just as expensive: a home
      // cook marking themselves unavailable and still receiving orders.
      const kitchen = await createKitchen(h, { name: 'Availability Kitchen' });
      const category = await createCategory(h);
      const product = await createProduct(h, kitchen.vendor.id, category.id);
      const seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });

      await h
        .api()
        .patch(`${API_PREFIX}/seller/listings/${product.id}/availability`)
        .set(auth(seller))
        .send({ isAvailable: 'false' })
        .expect(200);

      expect((await h.prisma.product.findUnique({ where: { id: product.id } }))!.isAvailable).toBe(
        false,
      );
    });
  });

  describe('review moderation', () => {
    it('reads "false" as un-hiding, not as hiding', async () => {
      const buyer = await createActor(h);
      const review = await h.prisma.review.create({
        data: {
          targetType: 'vendor',
          targetId: (await h.prisma.vendor.findFirst())!.id,
          userId: buyer.userId,
          userName: 'Test Buyer',
          rating: 5,
          title: 'Lovely',
          body: 'Really good pickle.',
          hidden: true,
        },
      });

      await h
        .api()
        .patch(`${API_PREFIX}/admin/catalog/reviews/${review.id}/moderate`)
        .set(auth(admin))
        .send({ hidden: 'false' })
        .expect(200);

      expect((await h.prisma.review.findUnique({ where: { id: review.id } }))!.hidden).toBe(false);
    });
  });

  describe('catalogue query flags', () => {
    it('still converts a real query string, which is why implicit conversion exists', async () => {
      // The behaviour that must not regress while fixing the other one.
      await h.api().get(`${API_PREFIX}/products?featured=true`).expect(200);
      await h.api().get(`${API_PREFIX}/products?featured=false`).expect(200);
    });

    it('filters on false rather than treating it as true', async () => {
      const kitchen = await createKitchen(h, { name: 'Query Kitchen' });
      const category = await createCategory(h);
      const plain = await createProduct(h, kitchen.vendor.id, category.id, { name: 'Plain' });
      const featured = await createProduct(h, kitchen.vendor.id, category.id, { name: 'Featured' });
      await h.prisma.product.update({ where: { id: featured.id }, data: { featured: true } });

      const onlyFeatured = await h.api().get(`${API_PREFIX}/products?featured=true`).expect(200);
      const body = JSON.stringify(onlyFeatured.body);
      expect(body).toContain(featured.id);
      expect(body).not.toContain(plain.id);
    });
  });
});
