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
  resetDatabase,
} from './harness';

/**
 * Order notifications (M18) — both sides actually hear about it.
 *
 * Before this, an order fanned out to nothing: the buyer heard nothing
 * after checkout, and the HomeKrafter got a single in-app row they would
 * only see by opening the portal. The delivery machinery had existed since
 * M9; it was simply never called from the order lifecycle, which is the
 * kind of gap that reads as "done" in every diff.
 *
 * **What these tests can and cannot see.** `TWILIO_*`/`WHATSAPP_*` are
 * placeholders in `test/e2e/env.ts`, so no provider call leaves the
 * process — deliberately, since a test run must never send a real message.
 * What they assert is therefore the layer that decides: one persisted
 * `Notification` row *per channel actually attempted*, which is the same
 * signal the real fan-out uses. A missing `whatsapp` row means the buyer
 * would not have been messaged in production either.
 */
describe('order notifications', () => {
  let h: Harness;
  let buyer: Actor;
  let sellerUserId: string;
  let seller: Actor;
  let productId: string;
  let productSku: string;
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
    // The buyer needs a phone for WhatsApp to be attemptable at all — a
    // channel with no contact info on file is skipped, not failed.
    await h.prisma.user.update({
      where: { id: buyer.userId },
      data: { phone: `+9198450${Math.floor(10000 + Math.random() * 89999)}` },
    });

    const kitchen = await createKitchen(h);
    seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
    sellerUserId = seller.userId;
    await h.prisma.user.update({
      where: { id: sellerUserId },
      data: { phone: `+9198760${Math.floor(10000 + Math.random() * 89999)}` },
    });

    const category = await createCategory(h);
    const product = await createProduct(h, kitchen.vendor.id, category.id);
    productId = product.id;
    productSku = product.defaultWeightSku;
    addressId = (await createAddress(h, buyer.userId)).id;
  });

  const notificationsFor = (userId: string) =>
    h.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  const channelsFor = async (userId: string) =>
    (await notificationsFor(userId)).map((n) => n.channel).sort();

  type Row = Awaited<ReturnType<typeof notificationsFor>>[number];

  /**
   * Wait for delivery to land, rather than reading straight after the HTTP
   * response.
   *
   * Delivery is deliberately fire-and-forget — a paid order must not roll
   * back because a message failed, so the caller does not await it. That
   * makes the endpoint returning 201 the wrong moment to look. Polling is
   * what an observer actually does; a fixed `sleep` would either be slower
   * than needed or flaky on a loaded machine.
   *
   * `predicate` receives every row for the user, so a caller can wait for
   * "the delivered one" rather than merely "any".
   */
  async function waitForNotifications(
    userId: string,
    predicate: (rows: Row[]) => boolean,
    what = 'notifications',
  ): Promise<Row[]> {
    const deadline = Date.now() + 5000;
    let rows: Row[] = [];
    while (Date.now() < deadline) {
      rows = await notificationsFor(userId);
      if (predicate(rows)) return rows;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Timed out waiting for ${what} for ${userId}. Saw: ` +
        JSON.stringify(rows.map((r) => ({ channel: r.channel, title: r.title }))),
    );
  }

  /** Nothing arrived, and stays not-arrived — used for the negative cases. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

  const addToCart = (id: string, sku: string, quantity = 1) =>
    h.api().post(`${API_PREFIX}/cart/items`).set(auth(buyer)).send({ productId: id, sku, quantity });

  /** Placing through the real endpoint is the only way to exercise the wiring. */
  async function placeOrder(): Promise<string> {
    await addToCart(productId, productSku).expect(201);

    const res = await h
      .api()
      .post(`${API_PREFIX}/orders`)
      .set(auth(buyer))
      .send({ paymentMethod: 'cod', defaultAddressId: addressId })
      .expect(201);
    return res.body.id;
  }

  describe('default channels', () => {
    it('switches WhatsApp on for an order, not for a promo', async () => {
      // The split is transactional versus marketing. Opting somebody into
      // marketing on WhatsApp is how a sender gets blocked, and a block is
      // per-sender — one promo would cost every future order update to
      // that person.
      const { defaultChannelsFor } = await import(
        '../../src/notifications/notifications-delivery.service'
      );

      expect(defaultChannelsFor('order').whatsapp).toBe(true);
      expect(defaultChannelsFor('wallet').whatsapp).toBe(true);
      expect(defaultChannelsFor('account').whatsapp).toBe(true);
      expect(defaultChannelsFor('promo').whatsapp).toBe(false);
      expect(defaultChannelsFor('promo').inapp).toBe(true);
    });

    it('leaves SMS off, so it does not duplicate WhatsApp at a per-message cost', async () => {
      const { defaultChannelsFor } = await import(
        '../../src/notifications/notifications-delivery.service'
      );
      expect(defaultChannelsFor('order').sms).toBe(false);
    });
  });

  describe('placing an order', () => {
    it('messages the buyer on WhatsApp, not just in the app', async () => {
      await placeOrder();

      const rows = await waitForNotifications(
        buyer.userId,
        (r) => r.some((n) => n.channel === 'whatsapp'),
        'a WhatsApp order confirmation',
      );
      const channels = rows.map((n) => n.channel);
      expect(channels).toContain('whatsapp');
      expect(channels).toContain('inapp');
    });

    it('messages the HomeKrafter whose food it is', async () => {
      await placeOrder();

      const rows = await waitForNotifications(
        sellerUserId,
        (r) => r.some((n) => n.channel === 'whatsapp'),
        'a new-order message to the kitchen',
      );
      expect(rows[0].title).toMatch(/new order/i);
    });

    it("names the items so the HomeKrafter can start without opening anything", async () => {
      await placeOrder();

      const rows = await waitForNotifications(sellerUserId, (r) => r.length > 0);
      expect(rows[0].body).toMatch(/Mango thokku pickle ×1/);
    });

    it('links the buyer to somewhere they can actually look', async () => {
      await placeOrder();
      const rows = await waitForNotifications(buyer.userId, (r) => r.length > 0);
      expect(rows[0].body).toMatch(/\/account\/orders/);
    });

    it('pings a HomeKrafter once for an order with several of their items', async () => {
      // One message per HomeKrafter, not per line.
      const category = await h.prisma.category.findFirstOrThrow();
      const kitchen = await h.prisma.seller.findUniqueOrThrow({ where: { userId: sellerUserId } });
      const second = await createProduct(h, kitchen.vendorId, category.id, { name: 'Lime pickle' });

      await addToCart(productId, productSku, 2).expect(201);
      await addToCart(second.id, second.defaultWeightSku, 1).expect(201);
      await h
        .api()
        .post(`${API_PREFIX}/orders`)
        .set(auth(buyer))
        .send({ paymentMethod: 'cod', defaultAddressId: addressId })
        .expect(201);

      const rows = await waitForNotifications(
        sellerUserId,
        (r) => r.some((n) => n.channel === 'inapp'),
      );
      const inapp = rows.filter((n) => n.channel === 'inapp');
      expect(inapp).toHaveLength(1);
      expect(inapp[0].body).toMatch(/3 items/);
    });

    it('records the order it is about, so the inbox row can link back', async () => {
      const orderId = await placeOrder();
      const rows = await waitForNotifications(buyer.userId, (r) => r.length > 0);
      expect(rows[0].refType).toBe('order');
      expect(rows[0].refId).toBe(orderId);
    });
  });

  describe('advancing an order', () => {
    it('tells the buyer at every step the HomeKrafter takes', async () => {
      // Starts at `placed`, not from checkout: a seller cannot advance an
      // order still at `pending_payment`, which is where COD leaves it.
      const order = await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'placed',
      });
      const orderId = order.id;
      const before = (await notificationsFor(buyer.userId)).length;

      // placed -> confirmed -> packed -> shipped -> delivered
      for (let i = 0; i < 4; i += 1) {
        await h
          .api()
          .post(`${API_PREFIX}/seller/orders/${orderId}/advance`)
          .set(auth(seller))
          .expect(201);
      }

      const rows = await waitForNotifications(
        buyer.userId,
        (r) => r.some((n) => /delivered/i.test(n.title)),
        'the full packed/shipped/delivered run',
      );
      expect(rows.length).toBeGreaterThan(before);
      const titles = rows.map((r) => r.title).join(' | ');
      expect(titles).toMatch(/packed/i);
      expect(titles).toMatch(/on the way/i);
      expect(titles).toMatch(/delivered/i);
    });

    it('sends the delivered message on WhatsApp too', async () => {
      const order = await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'shipped',
      });

      await h
        .api()
        .post(`${API_PREFIX}/seller/orders/${order.id}/advance`)
        .set(auth(seller))
        .expect(201);

      const rows = await waitForNotifications(
        buyer.userId,
        (r) => r.some((n) => /delivered/i.test(n.title) && n.channel === 'whatsapp'),
        'a delivered message on WhatsApp',
      );
      const delivered = rows.filter((n) => /delivered/i.test(n.title));
      expect(delivered.map((n) => n.channel)).toContain('whatsapp');
    });
  });

  describe('cancelling an order', () => {
    it('tells the buyer and every HomeKrafter who might be cooking', async () => {
      const orderId = await placeOrder();

      await h
        .api()
        .post(`${API_PREFIX}/orders/${orderId}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Changed my mind' })
        .expect(201);

      await waitForNotifications(
        buyer.userId,
        (r) => r.some((n) => /cancelled/i.test(n.title)),
        'a cancellation message to the buyer',
      );
      // The one that matters most: somebody may be halfway through
      // cooking it.
      await waitForNotifications(
        sellerUserId,
        (r) => r.some((n) => /cancelled/i.test(n.title)),
        'a cancellation message to the kitchen',
      );
    });

    it('does not send a second round when cancel is tapped twice', async () => {
      // Cancel is idempotent. Idempotent must mean silent the second time,
      // or a double-tap messages every HomeKrafter twice.
      const orderId = await placeOrder();

      await h.api().post(`${API_PREFIX}/orders/${orderId}/cancel`).set(auth(buyer)).send({}).expect(201);
      await waitForNotifications(sellerUserId, (r) => r.some((n) => /cancelled/i.test(n.title)));
      await settle();
      const afterFirst = (await notificationsFor(sellerUserId)).length;

      await h.api().post(`${API_PREFIX}/orders/${orderId}/cancel`).set(auth(buyer)).send({}).expect(201);
      await settle();
      expect((await notificationsFor(sellerUserId)).length).toBe(afterFirst);
    });
  });

  describe('an admin override is a real status change', () => {
    it('messages the buyer exactly as the normal path would', async () => {
      // A support agent fixing a stuck order must not leave the customer
      // less informed than the HomeKrafter's own tap would have.
      const admin = await createActor(h, 'admin');
      const order = await createOrder(h, {
        userId: buyer.userId,
        addressId,
        items: [{ productId, name: 'Pickle', price: 250 }],
        status: 'placed',
      });

      await h
        .api()
        .patch(`${API_PREFIX}/admin/orders/marketplace/${order.id}/status`)
        .set(auth(admin))
        .send({ status: 'shipped' })
        .expect(200);

      await waitForNotifications(
        buyer.userId,
        (r) => r.some((n) => /on the way/i.test(n.title)),
        'a shipped message from the admin override',
      );
    });
  });

  describe('the recipient stays in control', () => {
    it('sends nothing on a channel the user switched off', async () => {
      // The defaults are defaults. Somebody who turned WhatsApp off at
      // /account/notifications must stop receiving it, or the toggle is a
      // lie and the next stop is a spam report.
      await h.prisma.notificationPreference.create({
        data: { userId: buyer.userId, category: 'order', sms: false, whatsapp: false, email: false, inapp: true },
      });

      await placeOrder();
      await waitForNotifications(buyer.userId, (r) => r.length > 0);
      await settle();

      expect(await channelsFor(buyer.userId)).toEqual(['inapp']);
    });

    it('skips a channel it has no contact detail for', async () => {
      // A phone-less buyer is skipped with a log, never an error — and
      // never a persisted row claiming a message went out.
      await h.prisma.user.update({ where: { id: buyer.userId }, data: { phone: null } });

      await placeOrder();
      await waitForNotifications(buyer.userId, (r) => r.length > 0);
      await settle();

      expect(await channelsFor(buyer.userId)).not.toContain('whatsapp');
      expect(await channelsFor(buyer.userId)).toContain('inapp');
    });
  });
});
