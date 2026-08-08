import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * A name has to contain something a person can read.
 *
 * `@MinLength(1)` counts **characters**, and `"   "` is three of them —
 * so every name-shaped field on the platform accepted pure whitespace and
 * stored it verbatim. `POST /auth/register` with `{"name": "   "}`
 * returned 201, and that account then appeared as a blank on the admin
 * user list, in the wallet liability table, as the `customerName` on every
 * order row an admin sees, and as the `refereeName` on a referral.
 *
 * Found in a browser, not by reading code: a row on `/admin/wallet` with
 * a balance, a transaction count, and no name at all.
 *
 * The other half is that the **trimmed** value is what gets stored.
 * Validating a trimmed copy and then saving the padded original passes
 * every test and keeps the bug.
 */
describe('a name has to be readable', () => {
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

  const register = (name: string) =>
    h
      .api()
      .post(`${API_PREFIX}/auth/register`)
      .send({
        name,
        email: `blank-${Math.random().toString(36).slice(2, 10)}@example.com`,
        password: 'Passw0rd!123',
      });

  it.each([
    ['spaces', '   '],
    ['a tab', '\t'],
    ['a newline', '\n'],
    ['mixed whitespace', ' \t \n '],
    ['nothing at all', ''],
  ])('refuses a name made only of %s', async (_label, name) => {
    await register(name).expect(400);
    expect(await h.prisma.user.count()).toBe(0);
  });

  it('stores the trimmed name, not the padded one', async () => {
    const res = await register('  Ananya Iyer  ').expect(201);

    // Both halves. A leading space sorts an account to the top of every
    // admin list it appears in, which is the smaller cost; the larger one
    // is that "Ananya" and " Ananya" then look like two different people.
    expect(res.body.user.name).toBe('Ananya Iyer');
    const stored = await h.prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(stored.name).toBe('Ananya Iyer');
  });

  it('still allows a name with interior spaces, and a long one', async () => {
    // The rule is about *emptiness*, not about spaces. Anyone with a
    // middle name, a compound surname or a title has interior whitespace.
    const res = await register('Ana Maria de Souza Fernandes').expect(201);
    expect(res.body.user.name).toBe('Ana Maria de Souza Fernandes');
  });

  describe('the same rule on the fields other people read', () => {
    let buyer: Actor;

    beforeEach(async () => {
      buyer = await createActor(h);
    });

    it('refuses a blank delivery label or recipient', async () => {
      const address = {
        label: 'Home',
        recipientName: 'Ananya',
        phone: '9845012345',
        line1: '1 Test Road',
        city: 'Chandigarh',
        state: 'Chandigarh',
        pincode: '160017',
      };

      for (const field of ['label', 'recipientName', 'city', 'line1'] as const) {
        await h
          .api()
          .post(`${API_PREFIX}/users/me/addresses`)
          .set(auth(buyer))
          .send({ ...address, [field]: '   ' })
          .expect(400);
      }

      // Nothing was written by any of them.
      expect(await h.prisma.address.count()).toBe(0);
    });

    it('refuses a support ticket with a blank subject', async () => {
      await h
        .api()
        .post(`${API_PREFIX}/support/tickets`)
        .set(auth(buyer))
        .send({ subject: '   ', message: 'My order has not arrived.', channel: 'email' })
        .expect(400);

      expect(await h.prisma.supportTicket.count()).toBe(0);
    });

    it('trims a delivery address rather than storing the padding', async () => {
      const res = await h
        .api()
        .post(`${API_PREFIX}/users/me/addresses`)
        .set(auth(buyer))
        .send({
          label: '  Home  ',
          recipientName: '  Ananya Iyer  ',
          phone: '9845012345',
          line1: '  1 Test Road  ',
          city: '  Chandigarh  ',
          state: 'Chandigarh',
          pincode: '160017',
        })
        .expect(201);

      expect(res.body.label).toBe('Home');
      expect(res.body.recipientName).toBe('Ananya Iyer');
      expect(res.body.line1).toBe('1 Test Road');
      expect(res.body.city).toBe('Chandigarh');
    });
  });
});
