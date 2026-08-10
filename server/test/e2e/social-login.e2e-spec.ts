import * as http from 'http';
import * as argon2 from 'argon2';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';
import { API_PREFIX, Harness, createHarness, errorOf, resetDatabase } from './harness';
import { validateEnv } from '../../src/config/env.validation';

/**
 * `POST /auth/social/:provider` — the endpoint that used to hand out
 * sessions for a posted email address.
 *
 * **What this file is really pinning.** Until M27 the body was the
 * identity: `{"providerAccountId":"anything","email":"admin@…"}` returned
 * a full admin session, confirmed against a running server during the
 * 2026-08-06 audit. Two separate holes had to close, and the second is
 * the one that survives a naive fix:
 *
 * 1. The token is now verified against the provider's published keys, so
 *    a body alone proves nothing.
 * 2. Verifying the token is **not enough on its own.** `register` never
 *    sets `emailVerified`, so an attacker can register a victim's address
 *    with their own password and wait for the victim's first real Google
 *    sign-in. Link-by-email would then drop the victim inside the
 *    attacker's account. The "pre-registered account" group below is that
 *    scenario, and it is the reason this file exists rather than a
 *    handful of 401 assertions.
 *
 * The suite serves its own JWKS (see `env.ts`) so it can mint tokens it
 * controls. Issuer and audience are still the real values — only the key
 * source moves — so the wrong-issuer and wrong-audience cases stay honest.
 */

const JWKS_PORT = 45677;
const GOOGLE_ISS = 'https://accounts.google.com';
const GOOGLE_AUD = 'e2e-web.apps.googleusercontent.com';
const GOOGLE_AUD_IOS = 'e2e-ios.apps.googleusercontent.com';
const APPLE_ISS = 'https://appleid.apple.com';
const APPLE_AUD = 'in.homekrafted.e2e';

interface Signer {
  privateKey: KeyLike;
  kid: string;
}

/** The key the suite signs with, plus one it deliberately does not publish. */
let trusted: Signer;
let untrusted: Signer;
let jwksServer: http.Server;

async function makeSigner(kid: string): Promise<{ signer: Signer; jwk: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { signer: { privateKey, kid }, jwk };
}

interface TokenOptions {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string | null;
  emailVerified?: boolean | string;
  nonce?: string;
  name?: string;
  /** Seconds from now. Negative mints an already-expired token. */
  expiresInSeconds?: number;
  issuedAtOffsetSeconds?: number;
  signWith?: Signer;
}

async function mintToken(opts: TokenOptions = {}): Promise<string> {
  const signer = opts.signWith ?? trusted;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const iat = nowSeconds + (opts.issuedAtOffsetSeconds ?? 0);

  const claims: Record<string, unknown> = {
    sub: opts.sub ?? 'google-sub-000',
  };
  if (opts.email !== null) claims.email = opts.email ?? 'buyer@example.test';
  if (opts.emailVerified !== undefined) claims.email_verified = opts.emailVerified;
  else if (opts.email !== null) claims.email_verified = true;
  if (opts.nonce) claims.nonce = opts.nonce;
  if (opts.name) claims.name = opts.name;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: signer.kid })
    .setIssuer(opts.iss ?? GOOGLE_ISS)
    .setAudience(opts.aud ?? GOOGLE_AUD)
    .setIssuedAt(iat)
    .setExpirationTime(nowSeconds + (opts.expiresInSeconds ?? 600))
    .sign(signer.privateKey);
}

describe('POST /auth/social/:provider', () => {
  let h: Harness;

  const post = (provider: string, body: Record<string, unknown>) =>
    h.api().post(`${API_PREFIX}/auth/social/${provider}`).send(body);

  beforeAll(async () => {
    const t = await makeSigner('e2e-trusted');
    const u = await makeSigner('e2e-untrusted');
    trusted = t.signer;
    untrusted = u.signer;

    // Only the trusted key is published. A token signed by the other one
    // is the stand-in for a forgery.
    const body = JSON.stringify({ keys: [t.jwk] });
    jwksServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
    });
    await new Promise<void>((resolve) => jwksServer.listen(JWKS_PORT, '127.0.0.1', resolve));

    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
  });

  describe('a valid token', () => {
    it('creates an account and issues a session', async () => {
      const idToken = await mintToken({ sub: 'google-new-user', email: 'newbuyer@example.test' });

      const res = await post('google', { idToken }).expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe('newbuyer@example.test');
      expect(res.body.user.role).toBe('consumer');

      const user = await h.prisma.user.findUnique({
        where: { email: 'newbuyer@example.test' },
        include: { socialAccounts: true },
      });
      // The provider proved the address, so the account starts verified —
      // which is also what stops the next sign-in taking the seize path.
      expect(user?.emailVerified).toBe(true);
      expect(user?.socialAccounts).toHaveLength(1);
      expect(user?.socialAccounts[0].providerAccountId).toBe('google-new-user');
    });

    it('resolves the same account on a second sign-in', async () => {
      const first = await post('google', {
        idToken: await mintToken({ sub: 'google-repeat', email: 'repeat@example.test' }),
      }).expect(200);

      const second = await post('google', {
        idToken: await mintToken({ sub: 'google-repeat', email: 'repeat@example.test' }),
      }).expect(200);

      expect(second.body.user.id).toBe(first.body.user.id);
      expect(await h.prisma.socialAccount.count()).toBe(1);
    });

    it('accepts any configured client id, not only the first', async () => {
      // The native apps get their own Google client id. A single-string
      // audience passes every test written on the web id and then fails
      // closed on every mobile sign-in.
      await post('google', {
        idToken: await mintToken({ aud: GOOGLE_AUD_IOS, sub: 'google-ios', email: 'ios@example.test' }),
      }).expect(200);
    });

    it('matches an Apple token with no email by its subject', async () => {
      // Apple omits the email on repeat sign-ins and for private relay.
      // Matching by `sub` is the only thing that keeps those people in
      // their own account instead of minting a new one each time.
      const first = await post('apple', {
        idToken: await mintToken({
          iss: APPLE_ISS,
          aud: APPLE_AUD,
          sub: 'apple-sub-1',
          email: 'first@privaterelay.example.test',
        }),
      }).expect(200);

      const second = await post('apple', {
        idToken: await mintToken({
          iss: APPLE_ISS,
          aud: APPLE_AUD,
          sub: 'apple-sub-1',
          email: null,
        }),
      }).expect(200);

      expect(second.body.user.id).toBe(first.body.user.id);
    });
  });

  describe('a token we should not accept', () => {
    it('refuses one whose signature does not match the published key', async () => {
      // The forgery an attacker who has read the public JWKS would
      // actually attempt: claim the real `kid`, sign with your own key.
      // The signature check fails, which is unambiguous — 401.
      const res = await post('google', {
        idToken: await mintToken({ signWith: { privateKey: untrusted.privateKey, kid: trusted.kid } }),
      }).expect(401);
      expect(errorOf(res).message).toMatch(/could not be verified/i);
      expect(await h.prisma.user.count()).toBe(0);
    });

    it('answers 503, not 401, for a key id the provider is not publishing', async () => {
      // Deliberate, and the reasoning is worth keeping: an unknown `kid`
      // is what a forgery with a made-up key id looks like *and* what a
      // legitimate token looks like during a provider key rotation, in
      // the window before jose refetches. The two are indistinguishable
      // here, so the tie goes to the real user: 503 says "try again" and
      // the next attempt succeeds once the key set refreshes, where a 401
      // would tell them their sign-in is permanently broken. It costs an
      // attacker nothing — they are equally not signed in either way.
      const res = await post('google', {
        idToken: await mintToken({ signWith: untrusted }),
      }).expect(503);
      expect(errorOf(res).message).toMatch(/could not reach google/i);
      expect(await h.prisma.user.count()).toBe(0);
    });

    it('refuses an expired one', async () => {
      await post('google', {
        idToken: await mintToken({ expiresInSeconds: -60, issuedAtOffsetSeconds: -600 }),
      }).expect(401);
    });

    it('refuses one minted for a different audience', async () => {
      // Somebody else's Google app, replayed at ours.
      await post('google', {
        idToken: await mintToken({ aud: 'someone-elses-app.apps.googleusercontent.com' }),
      }).expect(401);
    });

    it('refuses one from a different issuer', async () => {
      await post('google', {
        idToken: await mintToken({ iss: 'https://evil.example.com' }),
      }).expect(401);
    });

    it('refuses a Google token whose email is unverified', async () => {
      const res = await post('google', {
        idToken: await mintToken({ email: 'unverified@example.test', emailVerified: false }),
      }).expect(401);
      expect(errorOf(res).message).toMatch(/not verified that email/i);
      expect(await h.prisma.user.count()).toBe(0);
    });

    it('refuses a replayed token when the nonce does not match', async () => {
      const idToken = await mintToken({ nonce: 'nonce-from-an-earlier-attempt' });
      await post('google', { idToken, nonce: 'this-attempts-nonce' }).expect(401);
    });

    it('accepts the token when the nonce does match', async () => {
      const nonce = 'matching-nonce-value';
      await post('google', { idToken: await mintToken({ nonce }), nonce }).expect(200);
    });
  });

  describe('the legacy takeover payload', () => {
    it('is refused outright, not merely ignored', async () => {
      // The exact body from the audit. It must fail loudly: an ignored
      // field can be quietly re-read by a later change, a rejected one
      // cannot. `forbidNonWhitelisted` is what makes this a 400.
      const admin = await h.prisma.user.create({
        data: {
          name: 'Admin',
          email: 'admin@homekrafted.example',
          role: 'admin',
          referralCode: 'ADMINREF1',
        },
      });

      await post('google', {
        providerAccountId: 'anything',
        email: 'admin@homekrafted.example',
      }).expect(400);

      // Nothing was linked, and no session was minted for the admin.
      expect(await h.prisma.socialAccount.count({ where: { userId: admin.id } })).toBe(0);
    });

    it('is still refused when a valid token rides alongside it', async () => {
      await post('google', {
        idToken: await mintToken(),
        email: 'admin@homekrafted.example',
      }).expect(400);
    });
  });

  describe('a pre-registered account (the second takeover)', () => {
    /**
     * The attack this closes: register the victim's address with a
     * password of your choosing, wait for them to click "Continue with
     * Google", and a link-by-email implementation signs them into the
     * account you control — password still yours.
     */
    it('seizes an unverified account instead of joining it', async () => {
      const victimEmail = 'victim@example.test';
      const attackerPassword = await argon2.hash('attacker-password-123');
      const squatted = await h.prisma.user.create({
        data: {
          name: 'Squatted',
          email: victimEmail,
          passwordHash: attackerPassword,
          // Never proved — `register` does not set this, which is the
          // whole basis of the attack.
          emailVerified: false,
          referralCode: 'SQUAT1',
        },
      });
      const attackerSession = await h.prisma.refreshToken.create({
        data: {
          userId: squatted.id,
          tokenHash: 'attacker-session-hash',
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });

      await post('google', {
        idToken: await mintToken({ sub: 'google-victim', email: victimEmail }),
      }).expect(200);

      const after = await h.prisma.user.findUnique({ where: { id: squatted.id } });
      // The attacker's password is gone, so they cannot sign back in.
      expect(after?.passwordHash).toBeNull();
      expect(after?.emailVerified).toBe(true);
      // And their existing session is revoked rather than left live.
      expect(
        await h.prisma.refreshToken.findUnique({ where: { id: attackerSession.id } }),
      ).toBeNull();
    });

    it('joins a verified account without disturbing its password', async () => {
      const email = 'realowner@example.test';
      const passwordHash = await argon2.hash('owners-own-password-123');
      const owner = await h.prisma.user.create({
        data: {
          name: 'Real Owner',
          email,
          passwordHash,
          // They proved this address themselves, by code.
          emailVerified: true,
          referralCode: 'OWNER1',
        },
      });
      const ownSession = await h.prisma.refreshToken.create({
        data: {
          userId: owner.id,
          tokenHash: 'owners-session-hash',
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });

      const res = await post('google', {
        idToken: await mintToken({ sub: 'google-owner', email }),
      }).expect(200);

      expect(res.body.user.id).toBe(owner.id);
      const after = await h.prisma.user.findUnique({ where: { id: owner.id } });
      // Adding Google is not a reason to log them out of their phone.
      expect(after?.passwordHash).toBe(passwordHash);
      expect(
        await h.prisma.refreshToken.findUnique({ where: { id: ownSession.id } }),
      ).not.toBeNull();
    });
  });

  describe('accounts that may not use this door', () => {
    it('refuses an admin, even with a perfectly valid token', async () => {
      // Same rule as the OTP test-code bypass: the admin can change payout
      // details, so its recovery surface must not extend to "whoever
      // controls that Google inbox".
      await h.prisma.user.create({
        data: {
          name: 'Admin',
          email: 'admin@homekrafted.example',
          role: 'admin',
          emailVerified: true,
          referralCode: 'ADMINREF2',
        },
      });

      const res = await post('google', {
        idToken: await mintToken({ sub: 'google-admin', email: 'admin@homekrafted.example' }),
      }).expect(401);
      expect(errorOf(res).message).toMatch(/admin accounts cannot sign in with google/i);
    });

    it('refuses a suspended account', async () => {
      await h.prisma.user.create({
        data: {
          name: 'Suspended',
          email: 'suspended@example.test',
          emailVerified: true,
          suspended: true,
          referralCode: 'SUSP1',
        },
      });

      await post('google', {
        idToken: await mintToken({ sub: 'google-susp', email: 'suspended@example.test' }),
      }).expect(401);
    });
  });

  describe('an unconfigured provider', () => {
    it('reports the truth on GET /auth/social/config', async () => {
      const res = await h.api().get(`${API_PREFIX}/auth/social/config`).expect(200);
      expect(res.body.google).toEqual({ enabled: true, clientId: GOOGLE_AUD });
      expect(res.body.apple.enabled).toBe(true);
    });
  });
});

/**
 * The production boot guard, tested against the pure function rather than
 * a booted app.
 *
 * `validateEnv` is a plain function, so this needs no Nest app — and
 * booting one with `NODE_ENV=production` would also trip the JWT-secret
 * checks and make the test brittle for nothing.
 */
describe('validateEnv — SOCIAL_JWKS_URL_OVERRIDE in production', () => {
  const productionBase = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-access-secret',
    JWT_REFRESH_SECRET: 'a-different-real-refresh-secret',
    NODE_ENV: 'production',
  };

  it('refuses to boot with the override set', () => {
    // Whoever sets this can mint tokens that verify as Google's. It is a
    // test affordance; production must not start with it.
    expect(() =>
      validateEnv({ ...productionBase, SOCIAL_JWKS_URL_OVERRIDE: 'http://127.0.0.1:45677/jwks.json' }),
    ).toThrow(/SOCIAL_JWKS_URL_OVERRIDE/);
  });

  it('boots without it', () => {
    expect(() => validateEnv(productionBase)).not.toThrow();
  });

  it('allows it outside production', () => {
    expect(() =>
      validateEnv({
        ...productionBase,
        NODE_ENV: 'test',
        SOCIAL_JWKS_URL_OVERRIDE: 'http://127.0.0.1:45677/jwks.json',
      }),
    ).not.toThrow();
  });
});
