import * as argon2 from 'argon2';
import {
  API_PREFIX,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  resetDatabase,
} from './harness';

/**
 * Admin-issued sign-in details, and the forced rotation that retires them
 * (M32).
 *
 * The feature exists because no provider key is set, so the welcome link
 * reaches nobody and an admin has to read something out over the phone.
 * That means a second person knowingly holds a working credential for an
 * account that can change payout details — so the interesting assertions
 * here are not "does it work" but "does it stop working": the password is
 * never stored in the clear, every other route is refused until it is
 * replaced, and replacing it kills any session opened with it.
 */
describe('admin-issued sign-in details (M32)', () => {
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

  /** An approved HomeKrafter whose account has no password, as approval leaves it. */
  const approvedKitchen = async () => {
    const { seller } = await createKitchen(h, { name: "Anjali's Kitchen" });
    await h.prisma.user.update({
      where: { id: seller.userId },
      data: { authProviders: ['phone'], passwordHash: null },
    });
    return seller;
  };

  /** Not `async` — callers chain `.expect()`, which only exists on the supertest request. */
  const issue = (adminActor: { token: string }, sellerId: string) =>
    h
      .api()
      .post(`${API_PREFIX}/admin/sellers/${sellerId}/temp-password`)
      .set({ Authorization: `Bearer ${adminActor.token}` });

  describe('issuing', () => {
    it('returns a password once and stores only its hash', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();

      const res = await issue(admin, seller.id).expect(200);

      const password: string = res.body.temporaryPassword;
      expect(typeof password).toBe('string');
      expect(password.length).toBeGreaterThanOrEqual(16);
      expect(res.body.displayName).toBe("Anjali's Kitchen");

      const user = await h.prisma.user.findUnique({ where: { id: seller.userId } });
      // The plaintext is nowhere in the row — only a verifiable hash.
      expect(user?.passwordHash).not.toContain(password);
      expect(user?.passwordHash).toContain('$argon2id$');
      await expect(argon2.verify(user!.passwordHash!, password)).resolves.toBe(true);
      expect(user?.mustChangePassword).toBe(true);
    });

    it('never writes the password into the audit trail', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();

      const res = await issue(admin, seller.id).expect(200);
      const password: string = res.body.temporaryPassword;

      const entries = await h.prisma.adminAuditLog.findMany({
        where: { action: 'seller.temp_password_issued' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].targetId).toBe(seller.id);
      expect(JSON.stringify(entries[0].metadata)).not.toContain(password);
    });

    it('issues a different password each time, and the old one stops working', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();
      const user = await h.prisma.user.findUnique({ where: { id: seller.userId } });

      const first: string = (await issue(admin, seller.id).expect(200)).body.temporaryPassword;
      const second: string = (await issue(admin, seller.id).expect(200)).body.temporaryPassword;
      expect(first).not.toBe(second);

      await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user!.email, password: first })
        .expect(401);
      await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user!.email, password: second })
        .expect(200);
    });

    it('leaves a live invite link alone — it reaches the same person', async () => {
      // Deliberate: the link lands in the HomeKrafter's own inbox and the
      // password goes via an admin, so they are two routes to one person
      // rather than two ways in for anyone else. Burning the link here
      // would break the case where their email actually works.
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();

      await h.prisma.passwordResetToken.create({
        data: {
          userId: seller.userId,
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await issue(admin, seller.id).expect(200);

      const live = await h.prisma.passwordResetToken.findMany({
        where: { userId: seller.userId, consumedAt: null },
      });
      expect(live).toHaveLength(1);
    });

    it('refuses a suspended account', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();
      await h.prisma.user.update({
        where: { id: seller.userId },
        data: { suspended: true },
      });

      await issue(admin, seller.id).expect(409);
    });

    it('is admin-only', async () => {
      const shopper = await createActor(h, 'consumer');
      const seller = await approvedKitchen();

      await h
        .api()
        .post(`${API_PREFIX}/admin/sellers/${seller.id}/temp-password`)
        .set(auth(shopper))
        .expect(403);
    });
  });

  describe('the account is locked to the password screen until it rotates', () => {
    const signInWithTemp = async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();
      const user = await h.prisma.user.findUnique({ where: { id: seller.userId } });
      const temporaryPassword: string = (await issue(admin, seller.id).expect(200)).body
        .temporaryPassword;

      const session = await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user!.email, password: temporaryPassword })
        .expect(200);

      return { seller, user: user!, temporaryPassword, session: session.body };
    };

    it('tells the client to send them to the password screen', async () => {
      const { session } = await signInWithTemp();
      expect(session.user.mustChangePassword).toBe(true);
    });

    it('refuses every other route with PASSWORD_CHANGE_REQUIRED', async () => {
      const { session } = await signInWithTemp();
      const bearer = { Authorization: `Bearer ${session.accessToken}` };

      for (const route of ['/seller/me', '/seller/dashboard', '/wallet', '/orders']) {
        const res = await h.api().get(`${API_PREFIX}${route}`).set(bearer).expect(403);
        expect(res.body.error?.code ?? res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('still allows reading its own account, so the screen can render', async () => {
      const { session } = await signInWithTemp();
      await h
        .api()
        .get(`${API_PREFIX}/users/me`)
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .expect(200);
    });

    it('lets the owner replace it, and opens everything up again', async () => {
      const { session, temporaryPassword } = await signInWithTemp();

      const changed = await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .send({ currentPassword: temporaryPassword, newPassword: 'my-own-password-99' })
        .expect(200);

      expect(changed.body.user.mustChangePassword).toBe(false);
      expect(changed.body.accessToken).toBeTruthy();

      // The returned session is a working one.
      await h
        .api()
        .get(`${API_PREFIX}/seller/me`)
        .set({ Authorization: `Bearer ${changed.body.accessToken}` })
        .expect(200);
    });

    it('refuses a change that does not know the issued password', async () => {
      const { session } = await signInWithTemp();

      await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .send({ currentPassword: 'not-the-one', newPassword: 'my-own-password-99' })
        .expect(401);
    });

    it('refuses re-setting the same password, which would clear the flag for nothing', async () => {
      const { session, temporaryPassword } = await signInWithTemp();

      await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .send({ currentPassword: temporaryPassword, newPassword: temporaryPassword })
        .expect(400);
    });

    it("kills the admin's copy: the temporary password no longer signs in", async () => {
      const { user, temporaryPassword, session } = await signInWithTemp();

      await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .send({ currentPassword: temporaryPassword, newPassword: 'my-own-password-99' })
        .expect(200);

      await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user.email, password: temporaryPassword })
        .expect(401);
      await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user.email, password: 'my-own-password-99' })
        .expect(200);
    });

    it('revokes a session an admin had already opened with it', async () => {
      const { user, temporaryPassword, session } = await signInWithTemp();

      // A second session on the same credential — what an admin holding
      // the password could have opened before the kitchen got round to it.
      const other = await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user.email, password: temporaryPassword })
        .expect(200);

      await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .send({ currentPassword: temporaryPassword, newPassword: 'my-own-password-99' })
        .expect(200);

      // Its refresh token is dead, so it cannot outlive the access token.
      await h
        .api()
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: other.body.refreshToken })
        .expect(401);
    });
  });

  /**
   * Three states, not two — and the third is the one that matters.
   *
   * `mustChangePassword` alone answers "have they replaced what we gave
   * them", which reads `false` both for somebody who arrived and chose a
   * password *and* for somebody who was never given one. Run against
   * production and all thirteen existing kitchens came back "onboarded"
   * without a single sign-in between them: the list with the most work
   * attached was reporting as the list with none.
   */
  describe('the admin list separates never-issued from never-used from arrived', () => {
    const stateOf = async (adminActor: { token: string }, sellerId: string) => {
      const res = await h
        .api()
        .get(`${API_PREFIX}/admin/sellers?pageSize=100`)
        .set({ Authorization: `Bearer ${adminActor.token}` })
        .expect(200);
      return res.body.items.find((s: { id: string }) => s.id === sellerId)?.signIn;
    };

    it('reports no_credentials for an account that has no password at all', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();

      const signIn = await stateOf(admin, seller.id);
      expect(signIn.status).toBe('no_credentials');
      expect(signIn.temporaryPassword).toBeNull();
    });

    it('reports awaiting once details are issued, with the password readable', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();
      const password: string = (await issue(admin, seller.id).expect(200)).body.temporaryPassword;

      const signIn = await stateOf(admin, seller.id);
      expect(signIn.status).toBe('awaiting');
      expect(signIn.temporaryPassword).toBe(password);
    });

    it('reports onboarded with nothing readable once they choose their own', async () => {
      const admin = await createActor(h, 'admin');
      const seller = await approvedKitchen();
      const user = await h.prisma.user.findUnique({ where: { id: seller.userId } });
      const password: string = (await issue(admin, seller.id).expect(200)).body.temporaryPassword;

      const session = await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: user!.email, password })
        .expect(200);
      await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.body.accessToken}` })
        .send({ currentPassword: password, newPassword: 'my-own-password-99' })
        .expect(200);

      const signIn = await stateOf(admin, seller.id);
      expect(signIn.status).toBe('onboarded');
      expect(signIn.temporaryPassword).toBeNull();
      expect(signIn.claimedAt).toBeTruthy();
    });

    it('filters to each state, and the three are disjoint', async () => {
      const admin = await createActor(h, 'admin');
      const bearer = { Authorization: `Bearer ${admin.token}` };

      const untouched = await approvedKitchen();
      const issued = await approvedKitchen();
      await issue(admin, issued.id).expect(200);
      const arrived = await approvedKitchen();
      const arrivedUser = await h.prisma.user.findUnique({ where: { id: arrived.userId } });
      const password: string = (await issue(admin, arrived.id).expect(200)).body.temporaryPassword;
      const session = await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: arrivedUser!.email, password })
        .expect(200);
      await h
        .api()
        .post(`${API_PREFIX}/auth/password/change`)
        .set({ Authorization: `Bearer ${session.body.accessToken}` })
        .send({ currentPassword: password, newPassword: 'my-own-password-99' })
        .expect(200);

      const idsFor = async (onboarding: string) => {
        const res = await h
          .api()
          .get(`${API_PREFIX}/admin/sellers?pageSize=100&onboarding=${onboarding}`)
          .set(bearer)
          .expect(200);
        return res.body.items.map((s: { id: string }) => s.id);
      };

      expect(await idsFor('no_credentials')).toEqual([untouched.id]);
      expect(await idsFor('awaiting')).toEqual([issued.id]);
      expect(await idsFor('onboarded')).toEqual([arrived.id]);
    });

    it('refuses a state nobody defined', async () => {
      const admin = await createActor(h, 'admin');
      await h
        .api()
        .get(`${API_PREFIX}/admin/sellers?onboarding=maybe`)
        .set({ Authorization: `Bearer ${admin.token}` })
        .expect(400);
    });
  });

  describe('nobody else is disturbed', () => {
    it('leaves an ordinary account free to use the site', async () => {
      const shopper = await createActor(h, 'consumer');
      const me = await h.api().get(`${API_PREFIX}/users/me`).set(auth(shopper)).expect(200);

      expect(me.body.mustChangePassword).toBe(false);
      await h.api().get(`${API_PREFIX}/wallet`).set(auth(shopper)).expect(200);
    });
  });
});
