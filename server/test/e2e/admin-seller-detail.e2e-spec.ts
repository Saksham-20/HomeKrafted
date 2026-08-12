import {
  API_PREFIX,
  Harness,
  auth,
  createActor,
  createAddress,
  createCategory,
  createHarness,
  createOrder,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * `GET /admin/sellers/:id/detail` (M32) — one HomeKrafter, whole.
 *
 * Two things worth pinning. It carries **contact details**, which is the
 * point (reaching a kitchen by phone is the entire onboarding path while
 * no provider key is set) and also the reason it must stay admin-only.
 * And its money figure is the kitchen's **line-item share**, not the
 * order total — an order spanning two kitchens must not credit each with
 * the whole thing, which is the same rule `analytics.service.ts` states
 * and the one a "revenue" number is most often written against.
 */
describe('admin HomeKrafter detail (M32)', () => {
  let h: Harness;
  let admin: { token: string };

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

  const bearer = () => ({ Authorization: `Bearer ${admin.token}` });

  let phoneSeq = 0;

  /**
   * An approved kitchen, created the way the platform creates one.
   *
   * Distinct phone per call — `User.phone` is unique, so two kitchens
   * sharing one fail at approval for a reason unrelated to this spec.
   */
  async function approvedKitchen(email = 'detail-kitchen@example.test') {
    const application = await h.prisma.sellerApplication.create({
      data: {
        businessName: 'Candle & Clay',
        contactName: 'Ila Mehta',
        email,
        phone: `+9190002223${String((phoneSeq += 1)).padStart(2, '0')}`,
        category: 'maker',
        specialties: ['crafts'],
        city: 'Chandigarh',
        area: 'chd-sector-34',
        description: 'Hand-poured soy candles and small stoneware.',
        status: 'new',
      },
    });
    const res = await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${application.id}/approve`)
      .set(bearer())
      .send({})
      .expect(201);
    return { sellerId: res.body.seller.id as string, vendorId: res.body.vendor.id as string };
  }

  const detail = async (sellerId: string) => {
    const res = await h
      .api()
      .get(`${API_PREFIX}/admin/sellers/${sellerId}/detail`)
      .set(bearer())
      .expect(200);
    return res.body;
  };

  it('answers with the record an admin needs to act on', async () => {
    const { sellerId, vendorId } = await approvedKitchen();

    const body = await detail(sellerId);

    expect(body.seller.displayName).toBe('Candle & Clay');
    expect(body.vendor.id).toBe(vendorId);
    expect(body.vendor.slug).toBeTruthy();
    expect(body.contact.email).toBe('detail-kitchen@example.test');
    expect(body.contact.phone).toMatch(/^\+9190002223\d\d$/);
    expect(body.contact.name).toBe('Ila Mehta');
  });

  it('carries the application they were approved on', async () => {
    const { sellerId } = await approvedKitchen();

    const body = await detail(sellerId);

    expect(body.application?.businessName).toBe('Candle & Clay');
    expect(body.application?.status).toBe('approved');
    expect(body.application?.description).toContain('soy candles');
  });

  it('reports a brand-new kitchen as empty rather than as broken', async () => {
    const { sellerId } = await approvedKitchen();

    const body = await detail(sellerId);

    expect(body.activity.listings).toEqual({ total: 0, available: 0, awaitingReview: 0 });
    expect(body.activity.orderCount).toBe(0);
    expect(body.activity.revenue).toBe(0);
    expect(body.activity.lastOrderAt).toBeUndefined();
    expect(body.activity.pendingPayoutAmount).toBe(0);
  });

  it('counts listings by what each switch actually means', async () => {
    const { sellerId, vendorId } = await approvedKitchen();
    const category = await createCategory(h);
    await createProduct(h, vendorId, category.id, { name: 'On sale' });
    const paused = await createProduct(h, vendorId, category.id, { name: 'Paused' });
    await h.prisma.product.update({ where: { id: paused.id }, data: { isAvailable: false } });
    await createProduct(h, vendorId, category.id, {
      name: 'In review',
      moderationStatus: 'pending',
    });

    const body = await detail(sellerId);

    // `isAvailable` is the kitchen's switch, `moderationStatus` the
    // admin's — they are separate questions and the page reports both.
    expect(body.activity.listings.total).toBe(3);
    expect(body.activity.listings.available).toBe(2);
    expect(body.activity.listings.awaitingReview).toBe(1);
  });

  it('reports their line-item share of a shared order, not the order total', async () => {
    const { sellerId, vendorId } = await approvedKitchen('shared-order@example.test');
    const other = await approvedKitchen('other-kitchen@example.test');
    const otherVendorId = (
      await h.prisma.seller.findUniqueOrThrow({ where: { id: other.sellerId } })
    ).vendorId;

    const category = await createCategory(h);
    const mine = await createProduct(h, vendorId, category.id, { name: 'Mine', price: 200 });
    const theirs = await createProduct(h, otherVendorId, category.id, {
      name: 'Theirs',
      price: 500,
    });

    const shopper = await createActor(h, 'consumer');
    const address = await createAddress(h, shopper.userId);
    await createOrder(h, {
      userId: shopper.userId,
      addressId: address.id,
      items: [
        { productId: mine.id, name: 'Mine', price: 200, quantity: 2 },
        { productId: theirs.id, name: 'Theirs', price: 500, quantity: 1 },
      ],
    });

    const body = await detail(sellerId);

    // 2 × ₹200 — not the ₹900 order, and not the other kitchen's ₹500.
    expect(body.activity.revenue).toBe(400);
    expect(body.activity.unitsSold).toBe(2);
    expect(body.activity.orderCount).toBe(1);
    expect(body.activity.lastOrderAt).toBeTruthy();
  });

  it('reports the onboarding state, and the password only while it is unused', async () => {
    const { sellerId } = await approvedKitchen();

    const issued = await detail(sellerId);
    expect(issued.signIn.status).toBe('awaiting');
    expect(issued.signIn.temporaryPassword).toBeTruthy();

    const user = await h.prisma.user.findFirstOrThrow({
      where: { email: 'detail-kitchen@example.test' },
    });
    const session = await h
      .api()
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: user.email, password: issued.signIn.temporaryPassword })
      .expect(200);
    await h
      .api()
      .post(`${API_PREFIX}/auth/password/change`)
      .set({ Authorization: `Bearer ${session.body.accessToken}` })
      .send({ currentPassword: issued.signIn.temporaryPassword, newPassword: 'their-own-99' })
      .expect(200);

    const after = await detail(sellerId);
    expect(after.signIn.status).toBe('onboarded');
    expect(after.signIn.temporaryPassword).toBeNull();
  });

  it('404s an id that is not a HomeKrafter', async () => {
    await h.api().get(`${API_PREFIX}/admin/sellers/nope/detail`).set(bearer()).expect(404);
  });

  it('is admin-only — it carries a private phone number', async () => {
    const { sellerId } = await approvedKitchen();
    const shopper = await createActor(h, 'consumer');

    await h
      .api()
      .get(`${API_PREFIX}/admin/sellers/${sellerId}/detail`)
      .set(auth(shopper))
      .expect(403);
  });
});
