import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createAddress,
  createCategory,
  createHarness,
  createKitchen,
  createOrder,
  createProduct,
  errorOf,
  resetDatabase,
} from './harness';

/**
 * **A review needs a delivered order.** On a platform whose whole
 * proposition is trusting a stranger's kitchen, an open review endpoint is
 * a review-bombing surface aimed squarely at the newest HomeKrafter with
 * three reviews — and the temptation to relax this "just for testing" is
 * exactly why it needs a test that seeds a delivered order instead.
 *
 * The second rule here is quieter and easier to break: rating aggregates
 * are **recomputed from rows, never incremented**. Any new path that
 * hides, un-hides or deletes a review has to call the recompute, or a
 * moderator's action silently does not apply.
 */
describe('reviews', () => {
  let h: Harness;
  let buyer: Actor;
  let vendorId: string;
  let productId: string;
  let addressId: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    buyer = await createActor(h);
    const { vendor } = await createKitchen(h);
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id);
    vendorId = vendor.id;
    productId = product.id;
    addressId = (await createAddress(h, buyer.userId)).id;
  });

  const post = (actor: Actor, body: object) =>
    h.api().post(`${API_PREFIX}/reviews`).set(auth(actor)).send(body);

  const review = (targetId: string, targetType = 'product') => ({
    targetType,
    targetId,
    rating: 5,
    title: 'Wonderful',
    body: 'Tasted exactly like my grandmother made it.',
  });

  describe('eligibility', () => {
    it('refuses a signed-in buyer who has never ordered', async () => {
      const res = await post(buyer, review(productId)).expect(403);
      expect(errorOf(res).message).toMatch(/delivered/i);
      expect(await h.prisma.review.count()).toBe(0);
    });

    it('refuses a buyer whose order has not been delivered yet', async () => {
      // Placed, packed and shipped are all "not yet". A review written
      // while the parcel is still with the HomeKrafter is a review of the
      // checkout — and it is the one an unhappy buyer writes fastest.
      for (const status of ['placed', 'packed', 'shipped'] as const) {
        await h.prisma.order.deleteMany({});
        await createOrder(h, {
          userId: buyer.userId,
          addressId,
          items: [{ productId, name: 'Pickle', price: 250 }],
          status,
        });
        await post(buyer, review(productId)).expect(403);
      }
      expect(await h.prisma.review.count()).toBe(0);
    });

    it('accepts a buyer with a delivered order', async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
      const res = await post(buyer, review(productId)).expect(201);
      expect(res.body.rating).toBe(5);
      expect(res.body.verifiedPurchase).toBe(true);
    });

    it("refuses a review of someone else's delivered order", async () => {
      // The order exists and the product was delivered — to a different
      // person. Eligibility is per-reviewer, not per-product.
      const otherBuyer = await createActor(h);
      const otherAddress = await createAddress(h, otherBuyer.userId);
      await createOrder(h, {
        userId: otherBuyer.userId,
        addressId: otherAddress.id,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
      await post(buyer, review(productId)).expect(403);
    });

    it('refuses an anonymous review outright', async () => {
      await h.api().post(`${API_PREFIX}/reviews`).send(review(productId)).expect(401);
    });

    it('lets a delivered product earn a review of its kitchen too', async () => {
      // A vendor review is earned by any delivered product from that
      // vendor — you reviewed the kitchen you actually bought from.
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
      await post(buyer, review(vendorId, 'vendor')).expect(201);
    });

    it('does not let one kitchen\'s delivery earn a review of another', async () => {
      const other = await createKitchen(h, { name: 'Other Kitchen' });
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
      await post(buyer, review(other.vendor.id, 'vendor')).expect(403);
    });

    it('404s on a product that does not exist, rather than 403', async () => {
      // Told apart on purpose: "no such thing" and "not yours to review"
      // are different answers, and collapsing them makes the endpoint
      // impossible to debug.
      await post(buyer, review('does-not-exist')).expect(404);
    });

    it('refuses a second review of the same thing', async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
      await post(buyer, review(productId)).expect(201);
      await post(buyer, review(productId)).expect(409);
      expect(await h.prisma.review.count()).toBe(1);
    });
  });

  describe('aggregates', () => {
    beforeEach(async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
    });

    it('moves the product card the review appears on', async () => {
      // A rating that lands without moving the card it appears on is the
      // same bug as not saving it at all.
      await post(buyer, { ...review(productId), rating: 4 }).expect(201);
      const product = await h.prisma.product.findUnique({ where: { id: productId } });
      expect(Number(product!.rating)).toBe(4);
      expect(product!.reviewCount).toBe(1);
    });

    it('averages across reviewers rather than overwriting', async () => {
      await post(buyer, { ...review(productId), rating: 5 }).expect(201);

      const second = await createActor(h);
      const secondAddress = await createAddress(h, second.userId);
      await createOrder(h, {
        userId: second.userId,
        addressId: secondAddress.id,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });
      await post(second, { ...review(productId), rating: 4 }).expect(201);

      const product = await h.prisma.product.findUnique({ where: { id: productId } });
      expect(Number(product!.rating)).toBe(4.5);
      expect(product!.reviewCount).toBe(2);
    });

    it('recomputes from rows, so a hidden review stops counting', async () => {
      // The rule that makes moderation work at all. If aggregates were
      // incremented rather than recomputed, hiding a review would take it
      // off the page and leave its stars on the card.
      await post(buyer, { ...review(productId), rating: 1 }).expect(201);
      const before = await h.prisma.product.findUnique({ where: { id: productId } });
      expect(Number(before!.rating)).toBe(1);

      const admin = await createActor(h, 'admin');
      const created = await h.prisma.review.findFirst({ where: { targetId: productId } });
      await h
        .api()
        .patch(`${API_PREFIX}/admin/catalog/reviews/${created!.id}/moderate`)
        .set(auth(admin))
        .send({ hidden: true })
        .expect(200);

      const after = await h.prisma.product.findUnique({ where: { id: productId } });
      expect(after!.reviewCount).toBe(0);
      expect(Number(after!.rating)).toBe(0);
    });

    it('excludes hidden reviews from the public list but not from the author\'s own', async () => {
      // A review taken down by a moderator must still be visible to the
      // person who wrote it, or "why is my review gone" has no answer
      // anywhere in the product.
      await post(buyer, review(productId)).expect(201);
      const created = await h.prisma.review.findFirst({ where: { targetId: productId } });
      await h.prisma.review.update({ where: { id: created!.id }, data: { hidden: true } });

      const publicList = await h
        .api()
        .get(`${API_PREFIX}/reviews?targetType=product&targetId=${productId}`)
        .expect(200);
      expect(publicList.body).toHaveLength(0);

      const mine = await h.api().get(`${API_PREFIX}/reviews/mine`).set(auth(buyer)).expect(200);
      expect(mine.body).toHaveLength(1);
    });
  });

  describe('pending list', () => {
    it('offers a delivered product, and stops once it is reviewed', async () => {
      // The only prompt to review anything that exists in the product.
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'delivered',
      });

      const before = await h.api().get(`${API_PREFIX}/reviews/mine/pending`).set(auth(buyer)).expect(200);
      expect(before.body.map((p: { targetId: string }) => p.targetId)).toContain(productId);

      await post(buyer, review(productId)).expect(201);

      const after = await h.api().get(`${API_PREFIX}/reviews/mine/pending`).set(auth(buyer)).expect(200);
      expect(after.body.map((p: { targetId: string }) => p.targetId)).not.toContain(productId);
    });

    it('offers nothing for an undelivered order', async () => {
      await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'shipped',
      });
      const res = await h.api().get(`${API_PREFIX}/reviews/mine/pending`).set(auth(buyer)).expect(200);
      expect(res.body).toHaveLength(0);
    });
  });
});
