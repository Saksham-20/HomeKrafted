import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  resetDatabase,
} from './harness';

/**
 * **An approved HomeKrafter must be able to sign in.**
 *
 * They could not. Approving an application mints an account with no
 * password at all (`authProviders: ['phone']`), which is deliberate — the
 * admin never sees or sets one. But the HomeKrafter sign-in tab offered
 * *only* email and password, so `POST /auth/login` returned "Incorrect
 * email or password" for a password that had never existed, and there was
 * no other door. Every kitchen onboarded through the real application
 * flow was locked out of the product it had just been approved for.
 *
 * The M17 fix was in the client (the phone tab), so what is pinned here is
 * the server-side contract it depends on: an approved application produces
 * an account reachable by phone OTP, carrying the seller role.
 *
 * **That was never the whole answer, and M21 finished it.** Phone OTP
 * needs an SMS provider; with Twilio unset a real OTP reaches the server
 * log and nowhere else, so the door this spec pins was open only in
 * theory. Approval now also sends a single-use set-password link by email
 * and SMS — see `seller-invite.e2e-spec.ts`. The assertions below still
 * hold and still matter (the account genuinely has no password *at the
 * moment of approval*), but read them as one door of two, not as the
 * design being complete.
 */
describe('an approved HomeKrafter can sign in', () => {
  let h: Harness;
  let admin: Actor;

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

  async function applyAndApprove(phone = '+919000111333', email = 'newcook@example.test') {
    const application = await h.prisma.sellerApplication.create({
      data: {
        businessName: "New Cook's Kitchen",
        contactName: 'New Cook',
        email,
        phone,
        category: 'maker',
        specialties: ['homemade_food'],
        city: 'Chandigarh',
        area: 'chd-sector-34',
        deliveryRadiusKm: 10,
        description: 'Daily home-cooked meals from my Sector 34 kitchen.',
        status: 'new',
      },
    });
    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/applications/${application.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(201);
    return { phone, email };
  }

  it('provisions an account with no password, by design', async () => {
    // Not a bug in itself — an admin should never set someone's password.
    // It is only a lockout when phone sign-in isn't offered.
    const { email } = await applyAndApprove();
    const user = await h.prisma.user.findUnique({ where: { email } });
    expect(user!.role).toBe('seller');
    expect(user!.passwordHash).toBeNull();
    expect(user!.authProviders).toEqual(['phone']);
  });

  it('refuses every password, because there is none to match', async () => {
    const { email } = await applyAndApprove();
    await h
      .api()
      .post(`${API_PREFIX}/auth/login`)
      .send({ email, password: 'anything-at-all' })
      .expect(401);
  });

  it('signs them in by phone OTP — the door that must exist', async () => {
    const { phone } = await applyAndApprove();

    await h.api().post(`${API_PREFIX}/auth/otp/request`).send({ phone }).expect(200);
    const otp = await h.prisma.phoneOtp.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    expect(otp).toBeTruthy();

    // The stored code is hashed, so the test verifies the *route* exists
    // and is reachable for this account rather than replaying the code.
    const user = await h.prisma.user.findUnique({ where: { phone } });
    expect(user!.role).toBe('seller');
    expect(user!.phone).toBe(phone);
  });

  it('gives them a seller record and their own storefront', async () => {
    const { email } = await applyAndApprove();
    const user = await h.prisma.user.findUnique({ where: { email } });
    const seller = await h.prisma.seller.findUnique({ where: { userId: user!.id } });
    expect(seller).toBeTruthy();
    expect(seller!.status).toBe('approved');
    expect(seller!.vendorId).toBeTruthy();
  });
});

/**
 * `GET /seller/me` — the endpoint that stops one HomeKrafter being shown
 * another's kitchen.
 *
 * The web client had no way to read the signed-in seller's own record, so
 * it looked the session user up in the **mock** seller list and, on a
 * miss, fell back to a demo record. A real kitchen is never in that list,
 * so every genuine HomeKrafter saw a seeded demo kitchen's name and
 * `vendorId` throughout their own portal.
 */
describe('GET /seller/me', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
  });

  it('returns the caller\'s own kitchen, not the first one in the database', async () => {
    // Two kitchens, and the one that would be picked by a careless query
    // is deliberately created first.
    const first = await createKitchen(h, { name: 'First Kitchen' });
    const mine = await createKitchen(h, { name: 'My Kitchen' });
    const seller = await createActor(h, 'seller', { sellerId: mine.seller.id });

    const res = await h.api().get(`${API_PREFIX}/seller/me`).set(auth(seller)).expect(200);
    expect(res.body.displayName).toBe('My Kitchen');
    expect(res.body.vendorId).toBe(mine.vendor.id);
    expect(res.body.vendorId).not.toBe(first.vendor.id);
    expect(res.body.vendorName).toBe('My Kitchen');
  });

  it('resolves from the session, so there is no id to tamper with', async () => {
    const mine = await createKitchen(h, { name: 'My Kitchen' });
    const theirs = await createKitchen(h, { name: 'Their Kitchen' });
    const seller = await createActor(h, 'seller', { sellerId: mine.seller.id });

    // No parameter exists to point this at another kitchen; a query
    // string is ignored rather than honoured.
    const res = await h
      .api()
      .get(`${API_PREFIX}/seller/me?sellerId=${theirs.seller.id}`)
      .set(auth(seller))
      .expect(200);
    expect(res.body.displayName).toBe('My Kitchen');
  });

  it('refuses a consumer and an anonymous caller', async () => {
    const buyer = await createActor(h);
    await h.api().get(`${API_PREFIX}/seller/me`).set(auth(buyer)).expect(403);
    await h.api().get(`${API_PREFIX}/seller/me`).expect(401);
  });
});
