import * as argon2 from 'argon2';
import { API_PREFIX, Harness, createHarness, resetDatabase } from './harness';

/**
 * `POST /auth/continue` — the single-field sign-in/sign-up (M25).
 *
 * This endpoint is where the whole auth surface now converges: one box,
 * one password, and the server deciding what that means. The cases below
 * are the ones that decide whether a real person gets in.
 *
 * The one to read first is the "no password set" group. An approved
 * HomeKrafter's account is created *without* a credential, so the obvious
 * implementation — look up, compare hash, 401 — tells every kitchen the
 * platform is trying to onboard that their password is wrong, for a
 * password that has never existed. `CLAUDE.md` records this as having
 * shipped before. It is a distinct status here specifically so the form
 * can offer the code route instead of arguing.
 */
describe('POST /auth/continue', () => {
  let h: Harness;

  const post = (body: Record<string, unknown>) =>
    h.api().post(`${API_PREFIX}/auth/continue`).send(body);

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
  });

  describe('signing up', () => {
    it('creates an account from an email, a password and a name', async () => {
      const res = await post({
        identifier: 'newcook@example.com',
        password: 'Passw0rd!123',
        name: 'New Cook',
      }).expect(200);

      expect(res.body.created).toBe(true);
      expect(res.body.kind).toBe('email');
      expect(res.body.user.email).toBe('newcook@example.com');
      expect(res.body.accessToken).toEqual(expect.any(String));

      // A brand-new account has proved nothing yet.
      expect(res.body.user.emailVerified).toBe(false);
    });

    it('creates an account from a bare Indian mobile number', async () => {
      const res = await post({
        identifier: '9845012345',
        password: 'Passw0rd!123',
        name: 'Phone Cook',
      }).expect(200);

      expect(res.body.created).toBe(true);
      expect(res.body.kind).toBe('phone');
      // Stored in E.164 whatever was typed — see `identifier.util.ts`.
      expect(res.body.user.phone).toBe('+919845012345');
    });

    it('asks for a name rather than inventing one', async () => {
      const res = await post({
        identifier: 'nameless@example.com',
        password: 'Passw0rd!123',
      }).expect(400);

      expect(res.body.error.message).toMatch(/^NAME_REQUIRED/);
      expect(await h.prisma.user.count({ where: { email: 'nameless@example.com' } })).toBe(0);
    });

    it('gives a new account a wallet and a loyalty account like every other path', async () => {
      const res = await post({
        identifier: 'walleted@example.com',
        password: 'Passw0rd!123',
        name: 'Walleted',
      }).expect(200);

      const userId = res.body.user.id as string;
      expect(await h.prisma.wallet.findUnique({ where: { userId } })).toBeTruthy();
      expect(await h.prisma.loyaltyAccount.findUnique({ where: { userId } })).toBeTruthy();
    });

    it('does not fail the signup when the verification code cannot be sent', async () => {
      // Delivery is a logged stub with no provider keys set, and the
      // per-destination request cap can also refuse. Neither may turn a
      // completed sign-up into an error in front of somebody who now has
      // an account — so the code send is fire-and-forget.
      for (let i = 0; i < 6; i += 1) {
        await h.prisma.otpChallenge.create({
          data: {
            destination: 'capped@example.com',
            codeHash: 'x',
            purpose: 'verify',
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
      }

      const res = await post({
        identifier: 'capped@example.com',
        password: 'Passw0rd!123',
        name: 'Capped',
      }).expect(200);

      expect(res.body.created).toBe(true);
    });
  });

  describe('signing in', () => {
    beforeEach(async () => {
      await post({
        identifier: 'returning@example.com',
        password: 'Passw0rd!123',
        name: 'Returning Cook',
      }).expect(200);
    });

    it('signs in an existing account rather than creating a second one', async () => {
      const res = await post({
        identifier: 'returning@example.com',
        password: 'Passw0rd!123',
      }).expect(200);

      expect(res.body.created).toBe(false);
      expect(await h.prisma.user.count({ where: { email: 'returning@example.com' } })).toBe(1);
    });

    it('ignores the case an address was typed in', async () => {
      const res = await post({
        identifier: 'RETURNING@Example.COM',
        password: 'Passw0rd!123',
      }).expect(200);

      expect(res.body.created).toBe(false);
    });

    it('refuses a wrong password', async () => {
      await post({ identifier: 'returning@example.com', password: 'wrongpassword' }).expect(401);
    });

    it('does not create an account when the password is wrong', async () => {
      // The dangerous failure mode of a combined form: treat a failed
      // sign-in as "must be new" and mint a duplicate.
      await post({
        identifier: 'returning@example.com',
        password: 'wrongpassword',
        name: 'Impostor',
      }).expect(401);

      expect(await h.prisma.user.count({ where: { email: 'returning@example.com' } })).toBe(1);
      expect(await h.prisma.user.findFirst({ where: { name: 'Impostor' } })).toBeNull();
    });

    it('reaches one account however the number was typed', async () => {
      await post({
        identifier: '9845012345',
        password: 'Passw0rd!123',
        name: 'One Person',
      }).expect(200);

      for (const spelling of ['+919845012345', '+91 98450 12345', '098450-12345']) {
        const res = await post({ identifier: spelling, password: 'Passw0rd!123' }).expect(200);
        expect(res.body.created).toBe(false);
      }

      expect(await h.prisma.user.count({ where: { phone: '+919845012345' } })).toBe(1);
    });

    it('refuses a suspended account', async () => {
      const user = await h.prisma.user.findUniqueOrThrow({
        where: { email: 'returning@example.com' },
      });
      await h.prisma.user.update({ where: { id: user.id }, data: { suspended: true } });

      await post({ identifier: 'returning@example.com', password: 'Passw0rd!123' }).expect(401);
    });
  });

  describe('an account that has no password — the approved HomeKrafter case', () => {
    beforeEach(async () => {
      // Exactly what admin approval produces: an account with a phone, no
      // credential, and `authProviders: ['phone']`.
      await h.prisma.user.create({
        data: {
          name: 'Approved Kitchen',
          phone: '+919812345678',
          authProviders: ['phone'],
          referralCode: 'KITCHEN250',
        },
      });
    });

    it('answers 409, not 401, so the form can offer the code route', async () => {
      const res = await post({
        identifier: '9812345678',
        password: 'anythingatall',
      }).expect(409);

      // The message has to name the way in. "Incorrect password" here is
      // the bug this status exists to prevent.
      expect(res.body.error.message).toMatch(/code/i);
    });

    it('never signs them in on a guessed password', async () => {
      // The 409 says the account exists. It must not also be a way in.
      const res = await post({
        identifier: '9812345678',
        password: 'anythingatall',
      }).expect(409);

      expect(res.body.accessToken).toBeUndefined();
    });

    it('still refuses when the account is suspended, before saying anything else', async () => {
      const user = await h.prisma.user.findUniqueOrThrow({
        where: { phone: '+919812345678' },
      });
      await h.prisma.user.update({ where: { id: user.id }, data: { suspended: true } });

      // Suspension outranks "you have no password" — otherwise a closed
      // account is told how to get back in.
      await post({ identifier: '9812345678', password: 'anythingatall' }).expect(401);
    });

    it('lets them in once a password exists', async () => {
      const user = await h.prisma.user.findUniqueOrThrow({
        where: { phone: '+919812345678' },
      });
      await h.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash('Passw0rd!123') },
      });

      const res = await post({
        identifier: '9812345678',
        password: 'Passw0rd!123',
      }).expect(200);

      expect(res.body.created).toBe(false);
      expect(res.body.user.role).toBe('consumer');
    });
  });

  describe('what the box will not accept', () => {
    it.each([
      ['not-an-identifier'],
      ['12345'],
      ['someone@'],
      ['@example.com'],
      [''],
      ['   '],
    ])('refuses %j', async (identifier) => {
      await post({ identifier, password: 'Passw0rd!123', name: 'Nope' }).expect(400);
    });

    it('refuses a password shorter than the minimum', async () => {
      await post({ identifier: 'shortpw@example.com', password: 'short', name: 'Short' }).expect(
        400,
      );
    });

    it('never returns the password hash', async () => {
      const res = await post({
        identifier: 'secret@example.com',
        password: 'Passw0rd!123',
        name: 'Secret',
      }).expect(200);

      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
    });
  });

  describe('verification is recorded, and is not a gate', () => {
    it('marks an email verified when its code is confirmed', async () => {
      const signup = await post({
        identifier: 'verify@example.com',
        password: 'Passw0rd!123',
        name: 'To Verify',
      }).expect(200);
      expect(signup.body.user.emailVerified).toBe(false);

      // The issued code only ever exists hashed and in a log line, so
      // plant one with a known value rather than guessing six digits.
      // This is still the real verify path — the same query, the same
      // argon2 comparison, the same consume.
      await h.prisma.otpChallenge.create({
        data: {
          destination: 'verify@example.com',
          codeHash: await argon2.hash('123456'),
          purpose: 'login',
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });

      const res = await h
        .api()
        .post(`${API_PREFIX}/auth/otp/verify`)
        .send({ identifier: 'verify@example.com', code: '123456' })
        .expect(200);

      expect(res.body.user.emailVerified).toBe(true);
      // And it is the same account, not a second one minted by the code path.
      expect(res.body.user.id).toBe(signup.body.user.id);
      expect(await h.prisma.user.count({ where: { email: 'verify@example.com' } })).toBe(1);
    });

    it('signs in a passwordless account by code — the HomeKrafter first visit, end to end', async () => {
      // The complete path the 409 above points at. If this breaks, an
      // approved kitchen has no way into the platform at all.
      const kitchen = await h.prisma.user.create({
        data: {
          name: 'Coded Kitchen',
          phone: '+919811111111',
          authProviders: ['phone'],
          referralCode: 'CODED250',
        },
      });

      await h.prisma.otpChallenge.create({
        data: {
          destination: '+919811111111',
          codeHash: await argon2.hash('654321'),
          purpose: 'login',
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });

      const res = await h
        .api()
        .post(`${API_PREFIX}/auth/otp/verify`)
        .send({ identifier: '9811111111', code: '654321' })
        .expect(200);

      expect(res.body.user.id).toBe(kitchen.id);
      expect(res.body.user.phoneVerified).toBe(true);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('issues a code the confirm step can actually redeem', async () => {
      // The bug this pins: the sign-up code was minted under a `verify`
      // purpose while `verifyOtp` reads `login`, so every new account was
      // shown a code box that its own code did not open — "No pending
      // code for this". Both halves worked in isolation; only the purpose
      // disagreed, which no unit test could see.
      await post({
        identifier: 'redeemable@example.com',
        password: 'Passw0rd!123',
        name: 'Redeemable',
      }).expect(200);

      // The send is deliberately fire-and-forget (a failed code must not
      // fail the sign-up), so the row lands just after the response. Poll
      // rather than sleep a fixed amount.
      let issued = null as Awaited<
        ReturnType<typeof h.prisma.otpChallenge.findFirst>
      > | null;
      for (let attempt = 0; attempt < 50 && !issued; attempt += 1) {
        issued = await h.prisma.otpChallenge.findFirst({
          where: { destination: 'redeemable@example.com' },
          orderBy: { createdAt: 'desc' },
        });
        if (!issued) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(issued).toBeTruthy();

      // Whatever purpose sign-up used, the verify endpoint must read the
      // same one. Asserted by round-tripping a known code through that
      // exact purpose rather than by naming the string here.
      await h.prisma.otpChallenge.update({
        where: { id: issued!.id },
        data: { codeHash: await argon2.hash('222333') },
      });

      const res = await h
        .api()
        .post(`${API_PREFIX}/auth/otp/verify`)
        .send({ identifier: 'redeemable@example.com', code: '222333' })
        .expect(200);

      expect(res.body.user.emailVerified).toBe(true);
    });

    it('lets an unverified account use the site straight away', async () => {
      const res = await post({
        identifier: 'unverified@example.com',
        password: 'Passw0rd!123',
        name: 'Unverified',
      }).expect(200);

      // No provider keys are set, so a code cannot actually be delivered.
      // If verification gated anything, this request would be the end of
      // every real sign-up.
      await h
        .api()
        .get(`${API_PREFIX}/users/me`)
        .set('Authorization', `Bearer ${res.body.accessToken as string}`)
        .expect(200);
    });
  });
});
