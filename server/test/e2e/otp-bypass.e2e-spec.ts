import { API_PREFIX, Harness, createHarness, resetDatabase } from './harness';

/**
 * The fixed test OTP code.
 *
 * It exists because `TWILIO_*` is a placeholder on production, so a real
 * code reaches the server log and nowhere else — and phone OTP is the only
 * first sign-in an approved HomeKrafter has. A fixed code makes that flow
 * testable without an SMS account.
 *
 * It is also the most dangerous thing in the auth layer, because
 * `verifyOtp` **creates an account for a number it does not recognise**. An
 * unscoped fixed code would therefore not be a testing shortcut but a
 * complete authentication bypass: sign in as anybody, including a
 * HomeKrafter whose payout details you could then change. Everything below
 * exists to hold the scoping in place, because the failure is silent — the
 * happy path looks identical whether or not the allowlist is honoured.
 *
 * `test/e2e/env.ts` sets `OTP_TEST_CODE` / `OTP_TEST_PHONES` before
 * `AppModule` is imported, mirroring production configuration.
 */
const TEST_CODE = '123456';
const ALLOWED = '+919845000001';
const ALSO_ALLOWED = '+919845000002';
const NOT_ALLOWED = '+919845999999';

describe('OTP test bypass', () => {
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

  const verify = (phone: string, code: string) =>
    h.api().post(`${API_PREFIX}/auth/otp/verify`).send({ phone, code });

  describe('the allowlist is the whole safety property', () => {
    it('signs in an allowlisted number with the fixed code, without an SMS', async () => {
      // No `otp/request` first: the point is that this works when nothing
      // can deliver a code.
      const res = await verify(ALLOWED, TEST_CODE).expect(200);
      expect(res.body.user.phone).toBe(ALLOWED);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('refuses the fixed code for a number that is not allowlisted', async () => {
      // The one that matters. If this passes, the code is a global
      // authentication bypass and every phone number on the platform is
      // six digits from being signed in as.
      await verify(NOT_ALLOWED, TEST_CODE).expect(401);
      expect(await h.prisma.user.count({ where: { phone: NOT_ALLOWED } })).toBe(0);
    });

    it('refuses a wrong code even for an allowlisted number', async () => {
      // Allowlisting a number widens what the *test code* reaches. It must
      // not turn the number itself into a passwordless door.
      await verify(ALLOWED, '999999').expect(401);
      await verify(ALLOWED, '').expect(400);
      expect(await h.prisma.user.count({ where: { phone: ALLOWED } })).toBe(0);
    });

    it('does not accept a code that merely starts with the test code', async () => {
      // Guards the length check in the timing-safe comparison: a prefix
      // match must not pass, and comparing buffers of unequal length would
      // otherwise throw rather than return false.
      await verify(ALLOWED, `${TEST_CODE}0`).expect(401);
    });
  });

  describe('an admin is out of reach', () => {
    it('refuses the fixed code for an account that is an admin', async () => {
      // Adding a number to the allowlist for a five-minute test must not be
      // able to hand the admin panel to anyone who knows a six-digit
      // constant — so the refusal lives at the layer that has resolved the
      // account, not at the layer that checked the code.
      await h.prisma.user.create({
        data: {
          name: 'Admin',
          email: 'admin-bypass@example.test',
          phone: ALLOWED,
          role: 'admin',
          referralCode: 'ADMINBYP1',
        },
      });

      const res = await verify(ALLOWED, TEST_CODE).expect(401);
      expect(res.body.error.message).toMatch(/admin/i);
    });

    it('still lets a HomeKrafter in — the account type this exists for', async () => {
      // An approved HomeKrafter has no password (approval never sets one),
      // so phone OTP is their only route in. If the admin refusal were
      // written as "any elevated role", it would relock the exact door M17
      // unlocked.
      await h.prisma.user.create({
        data: {
          name: 'Kitchen',
          email: 'kitchen-bypass@example.test',
          phone: ALSO_ALLOWED,
          role: 'seller',
          referralCode: 'KITCHBYP1',
        },
      });

      const res = await verify(ALSO_ALLOWED, TEST_CODE).expect(200);
      expect(res.body.user.role).toBe('seller');
    });
  });

  describe('it does not disturb the real flow', () => {
    it('still refuses an allowlisted number that has no pending OTP and a real-looking code', async () => {
      await verify(ALLOWED, '000000').expect(401);
    });

    it('consumes any pending real code, so it cannot be replayed afterwards', async () => {
      await h.api().post(`${API_PREFIX}/auth/otp/request`).send({ phone: ALLOWED }).expect(200);
      expect(await h.prisma.phoneOtp.count({ where: { phone: ALLOWED, consumedAt: null } })).toBe(1);

      await verify(ALLOWED, TEST_CODE).expect(200);

      expect(await h.prisma.phoneOtp.count({ where: { phone: ALLOWED, consumedAt: null } })).toBe(0);
    });

    it('leaves a real OTP for a non-allowlisted number working normally', async () => {
      // The bypass must be additive. A number nobody allowlisted still gets
      // the ordinary issue-verify cycle, including the refusal of a code it
      // was never sent.
      await h.api().post(`${API_PREFIX}/auth/otp/request`).send({ phone: NOT_ALLOWED }).expect(200);
      await verify(NOT_ALLOWED, '000000').expect(401);

      const row = await h.prisma.phoneOtp.findFirst({ where: { phone: NOT_ALLOWED } });
      expect(row!.attempts).toBe(1);
      expect(row!.consumedAt).toBeNull();
    });
  });
});
