import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * Three auth holes found by the production audit (2026-08-06). None of
 * them were visible from reading the happy path, and all three had been
 * reviewed and shipped.
 *
 * They share a shape worth naming: each was a check that ran *once*, at
 * the moment a session started, standing in for a rule that has to hold
 * *continuously*. Suspension was checked at login and never again. The
 * OTP attempt budget was counted per issued code rather than per phone.
 * Both look correct in the function they live in; both are wrong from one
 * step back.
 */
describe('auth hardening', () => {
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

  describe('suspension takes effect on the next request, not the next login', () => {
    const suspend = (userId: string, suspended: boolean) =>
      h.prisma.user.update({ where: { id: userId }, data: { suspended } });

    it('refuses a read with an access token minted before the suspension', async () => {
      const user = await createActor(h);
      await h.api().get(`${API_PREFIX}/users/me`).set(auth(user)).expect(200);

      await suspend(user.userId, true);

      // The token is still cryptographically valid and unexpired. Before
      // the fix this returned 200 for the remaining ~15 minutes of
      // JWT_ACCESS_TTL, because `assertNotSuspended` only ever ran on the
      // paths that *start* a session.
      const res = await h.api().get(`${API_PREFIX}/users/me`).set(auth(user)).expect(401);
      expect(res.body.error.message).toMatch(/suspended/i);
    });

    it('refuses a write with that same token', async () => {
      // The one that actually costs something. Suspending an account
      // mid-abuse has to stop the abuse, not schedule it to stop.
      const user = await createActor(h);
      await suspend(user.userId, true);

      await h
        .api()
        .patch(`${API_PREFIX}/users/me`)
        .set(auth(user))
        .send({ name: 'Should Not Persist' })
        .expect(401);

      const row = await h.prisma.user.findUnique({ where: { id: user.userId } });
      expect(row!.name).not.toBe('Should Not Persist');
    });

    it('lets the same token straight back in once the suspension is lifted', async () => {
      // Suspension is reversible, and un-suspending must not require the
      // person to notice they need to sign in again.
      const user = await createActor(h);
      await suspend(user.userId, true);
      await h.api().get(`${API_PREFIX}/users/me`).set(auth(user)).expect(401);

      await suspend(user.userId, false);
      await h.api().get(`${API_PREFIX}/users/me`).set(auth(user)).expect(200);
    });

    it('refuses a token signed for a user who no longer exists', async () => {
      const user = await createActor(h);
      await h.prisma.user.delete({ where: { id: user.userId } });

      await h.api().get(`${API_PREFIX}/users/me`).set(auth(user)).expect(401);
    });

    it('leaves unauthenticated public routes alone', async () => {
      // The guard now does a DB lookup. It must still short-circuit on
      // `@Public()` before touching Postgres, or every catalogue page pays
      // for a check that does not apply to it.
      await h.api().get(`${API_PREFIX}/products`).expect(200);
    });
  });

  describe('the OTP attempt budget is per phone number, not per issued code', () => {
    const PHONE = '+919333000111';

    const request = (phone: string) =>
      h.api().post(`${API_PREFIX}/auth/otp/request`).send({ phone });
    const verify = (phone: string, code: string) =>
      h.api().post(`${API_PREFIX}/auth/otp/verify`).send({ phone, code });

    it('does not reset the guess budget when a new code is requested', async () => {
      // The bug: MAX_ATTEMPTS counted against one PhoneOtp row, and
      // requesting a new code made a fresh row with attempts = 0. Five
      // guesses, request, five more, forever — against a six-digit space.
      let refused429 = false;

      for (let round = 0; round < 3 && !refused429; round += 1) {
        await request(PHONE).expect(200);
        for (let guess = 0; guess < 5; guess += 1) {
          const res = await verify(PHONE, '000000');
          if (res.status === 429) {
            refused429 = true;
            break;
          }
          expect(res.status).toBe(401);
        }
      }

      expect(refused429).toBe(true);
    });

    it('caps how many codes one number can be sent', async () => {
      // Uncapped this is somebody else's phone buzzing all night, and our
      // SMS bill paying for it.
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push((await request(PHONE)).status);
      }

      expect(statuses.filter((s) => s === 200).length).toBeGreaterThan(0);
      expect(statuses.at(-1)).toBe(429);
    });

    it('still signs in an allowlisted demo number with the fixed code', async () => {
      // The caps must not reach the one flow they sit next to: an approved
      // HomeKrafter's first sign-in is phone OTP and nothing else.
      await verify('+919845000001', '123456').expect(200);
    });
  });

  describe('an unexpected error does not describe itself to the client', () => {
    it('answers an unknown export kind with a 400 that names the valid ones', async () => {
      // Was a 500 reading "Cannot destructure property 'filename' of
      // '(intermediate value)' as it is undefined." — the switch had no
      // default, and the exception filter passed the raw message through.
      const admin = await createActor(h, 'admin');

      const res = await h
        .api()
        .get(`${API_PREFIX}/admin/exports/does-not-exist`)
        .set(auth(admin))
        .expect(400);

      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toMatch(/orders/);
      expect(res.body.error.message).not.toMatch(/destructure|undefined/i);
    });

    it('still builds a valid export', async () => {
      const admin: Actor = await createActor(h, 'admin');
      await h.api().get(`${API_PREFIX}/admin/exports/orders`).set(auth(admin)).expect(200);
    });
  });
});
