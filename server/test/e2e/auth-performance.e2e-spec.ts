import * as argon2 from 'argon2';
import { API_PREFIX, Harness, auth, createActor, createHarness, createKitchen, resetDatabase } from './harness';
import { AuthService } from '../../src/auth/auth.service';
import { PASSWORD_HASH_OPTIONS } from '../../src/auth/hashing';

/**
 * The M31 sign-in optimisations, from the outside.
 *
 * Every one of these changes made a request do less work, and each has a
 * way of doing *too much* less that no unit test would catch — a token
 * that lost a claim, a verification flag that stopped being written, a
 * legacy password that stopped being upgraded. They are pinned here
 * against a real database because that is where the mistake would live.
 */
describe('auth performance changes (M31)', () => {
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

  /** Reads the claims out of an access token without verifying it — we minted it. */
  const claimsOf = (token: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

  describe('the seller id now rides along on the sign-in lookup', () => {
    it('puts sellerId in the token a HomeKrafter signs in with', async () => {
      const { seller } = await createKitchen(h);
      const actor = await createActor(h, 'seller', { sellerId: seller.id });

      expect(claimsOf(actor.token).sellerId).toBe(seller.id);
    });

    it('keeps sellerId across a refresh', async () => {
      // The one that would break silently: the access token is fine, and
      // the portal only falls over fifteen minutes later when the first
      // refresh mints a token with no `sellerId` and every `/seller/*`
      // request starts answering 403 for no visible reason.
      const { seller } = await createKitchen(h);
      const email = `refresh-seller-${Date.now()}@example.test`;
      const password = 'test-password-123';

      const registered = await h
        .api()
        .post(`${API_PREFIX}/auth/register`)
        .send({ name: 'Refresh Kitchen', email, password })
        .expect(201);
      await h.prisma.user.update({
        where: { id: registered.body.user.id },
        data: { role: 'seller' },
      });
      await h.prisma.seller.update({
        where: { id: seller.id },
        data: { userId: registered.body.user.id },
      });

      const signedIn = await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email, password })
        .expect(200);
      expect(claimsOf(signedIn.body.accessToken).sellerId).toBe(seller.id);

      const refreshed = await h
        .api()
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: signedIn.body.refreshToken })
        .expect(200);

      expect(claimsOf(refreshed.body.accessToken).sellerId).toBe(seller.id);

      // And the claim is not merely present — it still opens the portal.
      await h
        .api()
        .get(`${API_PREFIX}/seller/me`)
        .set({ Authorization: `Bearer ${refreshed.body.accessToken}` })
        .expect(200);
    });

    it('leaves a consumer token without a sellerId', async () => {
      const actor = await createActor(h, 'consumer');
      expect(claimsOf(actor.token).sellerId).toBeUndefined();
    });
  });

  describe('GET /seller/me still answers with the storefront name', () => {
    it('returns the vendor name and slug from the single collapsed query', async () => {
      const { vendor, seller } = await createKitchen(h, { name: "Anjali's Kitchen" });
      const actor = await createActor(h, 'seller', { sellerId: seller.id });

      const res = await h.api().get(`${API_PREFIX}/seller/me`).set(auth(actor)).expect(200);

      expect(res.body).toMatchObject({
        id: seller.id,
        vendorId: vendor.id,
        vendorName: "Anjali's Kitchen",
        vendorSlug: vendor.slug,
        displayName: "Anjali's Kitchen",
      });
    });
  });

  describe('a password hashed under the old parameters is upgraded on sign-in', () => {
    it('re-hashes at the current cost, and the old password still works throughout', async () => {
      const password = 'test-password-123';
      const actor = await createActor(h, 'consumer');

      // Put the account back the way every pre-M31 account is stored.
      const legacy = await argon2.hash(password);
      await h.prisma.user.update({
        where: { id: actor.userId },
        data: { passwordHash: legacy },
      });

      // The re-hash is fire-and-forget in the request path, so drive the
      // seam directly rather than racing it — the request-path wiring is
      // one call, the behaviour worth pinning is this.
      const service = h.app.get(AuthService);

      await expect(service.maybeRehash(actor.userId, password, legacy)).resolves.toBe(true);

      const after = await h.prisma.user.findUnique({ where: { id: actor.userId } });
      expect(after?.passwordHash).not.toBe(legacy);
      expect(after?.passwordHash).toContain('m=19456,t=2,p=1');
      expect(argon2.needsRehash(after!.passwordHash!, PASSWORD_HASH_OPTIONS)).toBe(false);

      // Same password, new digest: signing in must be unaffected.
      await h
        .api()
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: actor.email, password })
        .expect(200);

      // And a second pass is a no-op rather than another write.
      await expect(
        service.maybeRehash(actor.userId, password, after!.passwordHash!),
      ).resolves.toBe(false);
    });

    it('signs in normally against a legacy digest', async () => {
      const password = 'test-password-123';
      const actor = await createActor(h, 'consumer');
      await h.prisma.user.update({
        where: { id: actor.userId },
        data: { passwordHash: await argon2.hash(password) },
      });

      await h
        .api()
        .post(`${API_PREFIX}/auth/continue`)
        .send({ identifier: actor.email, password })
        .expect(200);
    });
  });

  describe('verifying a code twice does not write the second time', () => {
    const phone = '+919845012345';

    /** Mints a challenge row directly — the same shape `requestOtp` stores. */
    const seedCode = async (code: string) => {
      await h.prisma.otpChallenge.create({
        data: {
          destination: phone,
          codeHash: await argon2.hash(code),
          purpose: 'login',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    };

    /**
     * Postgres stamps every row with the transaction that last wrote it.
     * `User` has no `updatedAt`, so this is the honest way to ask "was
     * this row written again?" — and it answers for *any* write, not
     * just one that changed a value we thought to check.
     */
    const rowVersion = async (userId: string): Promise<string> => {
      const [row] = await h.prisma.$queryRaw<{ xmin: string }[]>`
        SELECT xmin::text AS xmin FROM "User" WHERE id = ${userId}
      `;
      return row.xmin;
    };

    it('stamps phoneVerified the first time and leaves the row alone after', async () => {
      await seedCode('111222');
      const first = await h
        .api()
        .post(`${API_PREFIX}/auth/otp/verify`)
        .send({ identifier: phone, code: '111222' })
        .expect(200);

      const userId: string = first.body.user.id;
      const afterFirst = await h.prisma.user.findUnique({ where: { id: userId } });
      expect(afterFirst?.phoneVerified).toBe(true);
      expect(afterFirst?.authProviders).toContain('phone');
      const versionAfterFirst = await rowVersion(userId);

      await seedCode('333444');
      await h
        .api()
        .post(`${API_PREFIX}/auth/otp/verify`)
        .send({ identifier: phone, code: '333444' })
        .expect(200);

      const afterSecond = await h.prisma.user.findUnique({ where: { id: userId } });
      // Nothing changed, so nothing was written. This is the whole point
      // of the skip — a repeat code sign-in is the normal case for a
      // HomeKrafter who has not set a password.
      expect(await rowVersion(userId)).toBe(versionAfterFirst);
      expect(afterSecond?.phoneVerified).toBe(true);
    });

    it('still writes when the provider is new to the account', async () => {
      // Signed up with an email, now proving the phone: the flag is
      // unset and `phone` is missing from `authProviders`, so this must
      // not be skipped.
      const user = await h.prisma.user.create({
        data: {
          name: 'Email First',
          email: `emailfirst-${Date.now()}@example.test`,
          phone,
          emailVerified: true,
          authProviders: ['email'],
          referralCode: `REFEF${Date.now().toString(36).toUpperCase()}`,
        },
      });

      await seedCode('555666');
      await h
        .api()
        .post(`${API_PREFIX}/auth/otp/verify`)
        .send({ identifier: phone, code: '555666' })
        .expect(200);

      const after = await h.prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.phoneVerified).toBe(true);
      expect(after?.authProviders).toEqual(expect.arrayContaining(['email', 'phone']));
    });
  });

  describe('referral codes still allocate uniquely', () => {
    it('gives two people with the same first name different codes', async () => {
      const mk = async (email: string) =>
        h
          .api()
          .post(`${API_PREFIX}/auth/register`)
          .send({ name: 'Priya Sharma', email, password: 'test-password-123' })
          .expect(201);

      const a = await mk(`priya-a-${Date.now()}@example.test`);
      const b = await mk(`priya-b-${Date.now()}@example.test`);

      expect(a.body.user.referralCode).toBeTruthy();
      expect(b.body.user.referralCode).toBeTruthy();
      expect(a.body.user.referralCode).not.toBe(b.body.user.referralCode);
    });
  });
});
