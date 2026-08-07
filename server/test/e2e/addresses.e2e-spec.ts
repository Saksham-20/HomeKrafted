import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

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
});
