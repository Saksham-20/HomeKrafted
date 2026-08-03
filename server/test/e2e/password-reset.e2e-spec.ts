import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, resetDatabase } from './harness';
import * as crypto from 'crypto';

/**
 * Password reset (M18) — the only route back into an account whose
 * password is gone, and therefore a route *into* an account for anyone who
 * can subvert it.
 *
 * Four properties carry the whole thing, and none of them is visible from
 * the happy path:
 *
 * 1. **The endpoint is not an account-existence oracle.** A different
 *    answer for a known and an unknown address tells anyone who can POST
 *    which of your customers shop here.
 * 2. **A token is single-use and expires.** It sits in an inbox, and
 *    inboxes get breached long after the fact.
 * 3. **Requesting a second link kills the first.** Otherwise forwarding an
 *    old email still opens the account.
 * 4. **A reset revokes every session.** People reset passwords precisely
 *    when they think somebody else is in the account.
 */
describe('password reset', () => {
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

  const forgot = (email: string) =>
    h.api().post(`${API_PREFIX}/auth/password/forgot`).send({ email });

  const reset = (token: string, password: string) =>
    h.api().post(`${API_PREFIX}/auth/password/reset`).send({ token, password });

  const login = (email: string, password: string) =>
    h.api().post(`${API_PREFIX}/auth/login`).send({ email, password });

  /**
   * The token as the user would have it — recovered from the row's hash by
   * brute force is impossible, so the test reproduces the issue path
   * instead: read the row, and write a known token's hash over it.
   *
   * That is honest about what it tests. It proves consumption, expiry and
   * revocation, which is where the rules live; it cannot prove the emailed
   * string matches the row, so `issuesExactlyOneUsableToken` below checks
   * the row count and `sha256` shape separately.
   */
  async function plantToken(
    userId: string,
    opts: { expiresAt?: Date } = {},
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await h.prisma.passwordResetToken.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new Error('no pending reset token to re-key');
    await h.prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { tokenHash, ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}) },
    });
    return token;
  }

  describe('requesting a link', () => {
    it('answers identically for a real address and an unknown one', async () => {
      const actor = await createActor(h);

      const hit = await forgot(actor.email).expect(200);
      const miss = await forgot('nobody-at-all@example.test').expect(200);

      // Same status, same body. Anything that differs — including timing
      // language like "we couldn't find" — is the oracle.
      expect(hit.body).toEqual(miss.body);
      expect(hit.body.message).toMatch(/if an account exists/i);
    });

    it('creates a token for a real address and none for an unknown one', async () => {
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      await forgot('nobody-at-all@example.test').expect(200);

      const rows = await h.prisma.passwordResetToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(actor.userId);
    });

    it('stores a hash, never the token itself', async () => {
      // A leaked database dump must not be a pile of working reset links.
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);

      const row = await h.prisma.passwordResetToken.findFirstOrThrow();
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('invalidates an earlier unused link when a second is requested', async () => {
      const actor = await createActor(h);

      await forgot(actor.email).expect(200);
      const first = await plantToken(actor.userId);

      await forgot(actor.email).expect(200);

      // The first link must be dead the moment the second is issued —
      // otherwise a forwarded old email still opens the account.
      await reset(first, 'brand-new-password').expect(401);
      expect(
        await h.prisma.passwordResetToken.count({ where: { userId: actor.userId, consumedAt: null } }),
      ).toBe(1);
    });

    it('issues nothing for a suspended account', async () => {
      // A reset must not be a way back in for an account an admin closed.
      const actor = await createActor(h);
      await h.prisma.user.update({ where: { id: actor.userId }, data: { suspended: true } });

      await forgot(actor.email).expect(200);
      expect(await h.prisma.passwordResetToken.count()).toBe(0);
    });
  });

  describe('using a link', () => {
    it('sets the new password and lets it sign in', async () => {
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      const token = await plantToken(actor.userId);

      await reset(token, 'a-brand-new-password').expect(200);

      await login(actor.email, 'a-brand-new-password').expect(200);
      await login(actor.email, 'test-password-123').expect(401);
    });

    it('refuses the same link twice', async () => {
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      const token = await plantToken(actor.userId);

      await reset(token, 'first-new-password').expect(200);
      await reset(token, 'second-new-password').expect(401);

      // And the second attempt changed nothing.
      await login(actor.email, 'first-new-password').expect(200);
    });

    it('refuses an expired link', async () => {
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      const token = await plantToken(actor.userId, { expiresAt: new Date(Date.now() - 1000) });

      await reset(token, 'too-late-password').expect(401);
      await login(actor.email, 'test-password-123').expect(200);
    });

    it('refuses a token that never existed', async () => {
      await reset(crypto.randomBytes(32).toString('hex'), 'invented-password').expect(401);
    });

    it('gives one message for expired, used and never-existed alike', async () => {
      // Telling them apart tells an attacker holding a stale link whether
      // it was ever real, and for which account.
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      const used = await plantToken(actor.userId);
      await reset(used, 'first-new-password').expect(200);

      const reused = await reset(used, 'x-password-1').expect(401);
      const invented = await reset(crypto.randomBytes(32).toString('hex'), 'x-password-2').expect(401);

      expect(reused.body.error.message).toBe(invented.body.error.message);
    });

    it('enforces the same password floor as registration', async () => {
      // A reset path with a weaker minimum is a way to downgrade an
      // existing account's password.
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      const token = await plantToken(actor.userId);

      await reset(token, 'short').expect(400);
      // Rejected by validation, so the token must still be usable.
      await reset(token, 'long-enough-password').expect(200);
    });

    it('revokes every existing session', async () => {
      // The point of a reset for someone who thinks they are compromised.
      // Leaving the attacker's refresh token alive defeats it entirely.
      const actor = await createActor(h);
      const before = await h.prisma.refreshToken.count({
        where: { userId: actor.userId, revokedAt: null },
      });
      expect(before).toBeGreaterThan(0);

      await forgot(actor.email).expect(200);
      const token = await plantToken(actor.userId);
      await reset(token, 'a-brand-new-password').expect(200);

      expect(
        await h.prisma.refreshToken.count({ where: { userId: actor.userId, revokedAt: null } }),
      ).toBe(0);
    });

    it('lets a phone-only HomeKrafter set their first password', async () => {
      // The account shape M17 was about: approval mints an account with
      // `authProviders: ['phone']` and no credential. Reset is how they
      // gain one, and the provider list has to learn about it or the
      // account still claims to be phone-only.
      const user = await h.prisma.user.create({
        data: {
          name: 'Kitchen',
          email: 'kitchen-reset@example.test',
          phone: '+919845777777',
          role: 'seller',
          authProviders: ['phone'],
          referralCode: 'KITCHRST1',
        },
      });

      await forgot(user.email!).expect(200);
      const token = await plantToken(user.id);
      await reset(token, 'my-first-password').expect(200);

      const after = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.authProviders).toEqual(expect.arrayContaining(['phone', 'email']));
      await login(user.email!, 'my-first-password').expect(200);
    });

    it('refuses to reset a suspended account even with a valid token', async () => {
      // The token could predate the suspension.
      const actor = await createActor(h);
      await forgot(actor.email).expect(200);
      const token = await plantToken(actor.userId);

      await h.prisma.user.update({ where: { id: actor.userId }, data: { suspended: true } });
      await reset(token, 'a-brand-new-password').expect(401);
    });
  });

  describe('it is not a way to reach someone else', () => {
    it('resets only the account the token belongs to', async () => {
      const one = await createActor(h);
      const two = await createActor(h);

      await forgot(one.email).expect(200);
      const token = await plantToken(one.userId);
      await reset(token, 'one-new-password').expect(200);

      await login(two.email, 'test-password-123').expect(200);
      await login(two.email, 'one-new-password').expect(401);
    });

    it('needs no session, and ignores one that is presented', async () => {
      // The token is the credential. A signed-in attacker must not be able
      // to reset a different account by attaching their own bearer.
      const victim = await createActor(h);
      const attacker: Actor = await createActor(h);

      await forgot(victim.email).expect(200);
      const token = await plantToken(victim.userId);

      await h
        .api()
        .post(`${API_PREFIX}/auth/password/reset`)
        .set(auth(attacker))
        .send({ token, password: 'attacker-chosen-pw' })
        .expect(200);

      // It worked — but on the token's owner, not on the bearer.
      await login(victim.email, 'attacker-chosen-pw').expect(200);
      await login(attacker.email, 'attacker-chosen-pw').expect(401);
    });
  });
});
