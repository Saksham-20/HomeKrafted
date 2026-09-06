import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createCategory,
  createHarness,
  createKitchen,
  createOrder,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * An address is the one record on this platform that a person physically
 * travels to.
 *
 * Until the 2026-08-07 audit, `phone` and `pincode` were validated as
 * "a non-empty string" and nothing else. `POST /users/me/addresses` with
 * `phone: "not-a-phone"` and `pincode: "ABCDEF"` was accepted and stored,
 * the address book listed it, and checkout would ship to it — confirmed
 * against a running server, not inferred.
 *
 * The cost of that lands entirely on the HomeKrafter. A delivery is routed
 * by pincode and rescued by phone, so a malformed pair means a home cook
 * who has already cooked the food, set out to deliver it, and has no way
 * to find or call the buyer.
 */
describe('a delivery address', () => {
  let h: Harness;
  let buyer: Actor;

  const VALID = {
    label: 'Home',
    recipientName: 'Ananya Iyer',
    phone: '9845012345',
    line1: '14, 2nd Cross',
    city: 'Chandigarh',
    state: 'Chandigarh',
    pincode: '160034',
  };

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    buyer = await createActor(h);
  });

  const post = (body: Record<string, unknown>) =>
    h.api().post(`${API_PREFIX}/users/me/addresses`).set(auth(buyer)).send(body);

  it('is created when the phone and pincode are real', async () => {
    const res = await post(VALID).expect(201);
    expect(res.body.pincode).toBe('160034');
  });

  describe('the phone number', () => {
    // Every one of these is how somebody actually types an Indian mobile.
    // Refusing the common format would be a worse bug than the one this
    // validation exists to fix, which is why the DTO is region-locked to
    // 'IN' rather than using the region-less form (that one demands strict
    // E.164 and rejects a bare `9845012345`).
    it.each(['9845012345', '+919845012345', '+91 98450 12345', '098450 12345', '98450-12345'])(
      'accepts %s',
      async (phone) => {
        await post({ ...VALID, phone }).expect(201);
      },
    );

    it.each(['not-a-phone', '12345', '', '   ', '98450123456789'])(
      'refuses %p and stores nothing',
      async (phone) => {
        await post({ ...VALID, phone }).expect(400);
        expect(await h.prisma.address.count({ where: { userId: buyer.userId } })).toBe(0);
      },
    );

    it('refuses a number that is valid somewhere else', async () => {
      // A US mobile cannot be rung by a home cook standing outside a gate
      // in Mohali. This is a delivery address, not a contact card.
      await post({ ...VALID, phone: '+14155552671' }).expect(400);
    });
  });

  describe('the pincode', () => {
    it.each(['160034', '140603', '134109'])('accepts the tricity code %s', async (pincode) => {
      await post({ ...VALID, pincode }).expect(201);
    });

    it.each(['ABCDEF', '12345', '1234567', '', '012345', '16 0034'])(
      'refuses %p and stores nothing',
      async (pincode) => {
        await post({ ...VALID, pincode }).expect(400);
        expect(await h.prisma.address.count({ where: { userId: buyer.userId } })).toBe(0);
      },
    );

    it('accepts a code outside the tricity', async () => {
      // Deliberately a format check, not a lookup against a list of codes
      // we serve. A new or out-of-area code must not be undeliverable
      // because our table is stale — coverage is a delivery-radius
      // question, decided elsewhere and for a reason a buyer can read.
      await post({ ...VALID, pincode: '560038' }).expect(201);
    });
  });

  it('applies the same rules to an edit', async () => {
    // `UpdateAddressDto extends PartialType(CreateAddressDto)`, so this
    // holds by construction — asserted anyway, because a future rewrite
    // that gives the update its own DTO would silently reopen the hole on
    // the path people use to *correct* a bad address.
    const created = await post(VALID).expect(201);

    await h
      .api()
      .patch(`${API_PREFIX}/users/me/addresses/${created.body.id}`)
      .set(auth(buyer))
      .send({ pincode: 'ABCDEF' })
      .expect(400);

    const unchanged = await h.prisma.address.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(unchanged.pincode).toBe('160034');
  });

  /**
   * **Deleting an address archives it** (2026-09-06).
   *
   * `prisma.address.delete` raised a foreign-key violation for any
   * address that had ever been in a cart or on an order — eight tables
   * reference `Address` under `Restrict`, correctly, because an order has
   * to keep saying where it went — and the global filter turns that into
   * a bare 500 with a reference number. So the address a buyer most wants
   * to tidy away, the one they have ordered to, was the one the endpoint
   * could not remove.
   */
  describe('deleting one', () => {
    /** An address with an order line against it — the case that used to 500. */
    async function usedAddress() {
      const created = await post(VALID).expect(201);
      const kitchen = await createKitchen(h);
      const category = await createCategory(h);
      const product = await createProduct(h, kitchen.vendor.id, category.id);
      await createOrder(h, {
        userId: buyer.userId,
        addressId: created.body.id,
        items: [{ productId: product.id, name: product.name, price: 250 }],
      });
      return created.body.id as string;
    }

    it('succeeds for an address that is on a past order, and keeps the order intact', async () => {
      const addressId = await usedAddress();

      await h.api().delete(`${API_PREFIX}/users/me/addresses/${addressId}`).set(auth(buyer)).expect(204);

      // Gone from the buyer's book...
      const list = await h.api().get(`${API_PREFIX}/users/me/addresses`).set(auth(buyer)).expect(200);
      expect(list.body).toHaveLength(0);

      // ...and still on the order, which is the whole point. A deleted
      // row here would leave a six-month-old order unable to say where
      // it was delivered.
      const row = await h.prisma.address.findUniqueOrThrow({ where: { id: addressId } });
      expect(row.archivedAt).not.toBeNull();
      expect(await h.prisma.orderItem.count({ where: { addressId } })).toBe(1);
    });

    it('will not let a stale client order to one afterwards', async () => {
      const addressId = await usedAddress();
      await h.api().delete(`${API_PREFIX}/users/me/addresses/${addressId}`).set(auth(buyer)).expect(204);

      // An archived address answers exactly like somebody else's: to this
      // account it is gone, so editing it, re-defaulting it and deleting
      // it twice all 404.
      await h
        .api()
        .patch(`${API_PREFIX}/users/me/addresses/${addressId}`)
        .set(auth(buyer))
        .send({ label: 'Back please' })
        .expect(404);
      await h.api().delete(`${API_PREFIX}/users/me/addresses/${addressId}`).set(auth(buyer)).expect(404);
    });

    it('hands the default to the oldest survivor', async () => {
      // The first address created becomes the default automatically.
      const first = await post(VALID).expect(201);
      const second = await post({ ...VALID, label: 'Office' }).expect(201);
      expect(first.body.isDefault).toBe(true);

      await h.api().delete(`${API_PREFIX}/users/me/addresses/${first.body.id}`).set(auth(buyer)).expect(204);

      // Not "no default": checkout falls back to it, so an account with
      // none turns into "we could not work out where to send this" at the
      // till.
      const promoted = await h.prisma.address.findUniqueOrThrow({ where: { id: second.body.id } });
      expect(promoted.isDefault).toBe(true);
      // And the archived row does not keep the flag, or `findFirst({
      // isDefault: true })` would hand checkout an invisible address.
      const archived = await h.prisma.address.findUniqueOrThrow({ where: { id: first.body.id } });
      expect(archived.isDefault).toBe(false);
    });
  });
});
