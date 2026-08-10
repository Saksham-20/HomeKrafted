import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProvider } from '@prisma/client';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { AppConfig } from '../config/configuration';

/**
 * What a verified provider token tells us about the person holding it.
 *
 * Every field here comes out of the *signed* payload. Nothing the client
 * posted alongside the token reaches this shape — that separation is the
 * whole point of the type, and it is why `SocialLoginDto` no longer
 * carries `providerAccountId` or `email` at all.
 */
export interface VerifiedSocialIdentity {
  provider: SocialProvider;
  /** The provider's stable subject id. The only durable join key. */
  providerAccountId: string;
  /** Absent for Apple on repeat sign-ins, and for private-relay accounts. */
  email?: string;
  /**
   * Whether the provider asserts the address is theirs. Google states it
   * per token; Apple only returns an email when it is verified, so an
   * Apple email present here is verified by construction.
   */
  emailVerified: boolean;
  /** Only Apple's *first* authorization carries a name, and not in the token. */
  name?: string;
}

interface ProviderSpec {
  issuers: string[];
  jwksUrl: string;
  audiences: string[];
}

/**
 * How much clock skew we forgive between us and the provider.
 *
 * A VPS whose NTP has drifted by seconds should not lock every user out;
 * 60s is the conventional allowance and still far shorter than a token's
 * hour-long life.
 */
const CLOCK_TOLERANCE_SECONDS = 60;

/**
 * How old an `iat` may be before we refuse it, independent of `exp`.
 *
 * `exp` alone gives a captured token a full hour of replay value. The
 * nonce check below is the real defence; this bounds the window for
 * flows that predate a nonce (Apple's redirect) and costs nothing when
 * the token was minted for this sign-in, which is the normal case.
 */
const MAX_TOKEN_AGE_SECONDS = 15 * 60;

/**
 * Verifies Google/Apple id-tokens against the provider's published keys.
 *
 * **This is a provider, not a helper called inline, and that is
 * load-bearing.** `createRemoteJWKSet` returns a function that caches the
 * fetched key set for ten minutes and rate-limits refetches with a
 * thirty-second cooldown. Built per request, that cache never survives to
 * be used: every sign-in would hit Google, and Google throttling us would
 * become a total sign-in outage. Built once here, a key fetch happens
 * roughly twice an hour.
 *
 * Two more rules encoded below, both easy to lose in a rewrite:
 *
 * - **A missing key is not always a forgery.** During a provider key
 *   rotation an unknown `kid` inside the refetch cooldown raises
 *   `JWKSNoMatchingKey` — the same error a forged token raises. Answering
 *   401 there tells a legitimate user their sign-in failed, permanently,
 *   for as long as the rotation takes. Everything that could be transient
 *   maps to 503 with copy that points at another door.
 * - **Audience is a list.** `server/` is shared with the native apps, and
 *   Google issues a separate client id per platform. A single-string
 *   audience works right up until the iOS build ships and then fails
 *   closed on every mobile sign-in.
 */
@Injectable()
export class SocialTokenVerifier {
  private readonly logger = new Logger(SocialTokenVerifier.name);
  private readonly specs = new Map<SocialProvider, ProviderSpec>();
  private readonly keySets = new Map<SocialProvider, JWTVerifyGetKey>();

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const social = this.configService.get('social', { infer: true });

    // A single override for both providers, and it replaces only the JWKS
    // URL — issuer and audience stay real, so "a token from the wrong
    // issuer is refused" remains a testable claim rather than something
    // the test harness quietly switches off. `validateEnv` refuses to boot
    // production with it set.
    const override = social.jwksUrlOverride;

    if (social.google.clientIds.length > 0) {
      this.specs.set(SocialProvider.google, {
        issuers: ['accounts.google.com', 'https://accounts.google.com'],
        jwksUrl: override || 'https://www.googleapis.com/oauth2/v3/certs',
        audiences: social.google.clientIds,
      });
    }

    if (social.apple.serviceIds.length > 0) {
      this.specs.set(SocialProvider.apple, {
        issuers: ['https://appleid.apple.com'],
        jwksUrl: override || 'https://appleid.apple.com/auth/keys',
        audiences: social.apple.serviceIds,
      });
    }

    for (const [provider, spec] of this.specs) {
      this.keySets.set(provider, createRemoteJWKSet(new URL(spec.jwksUrl)));
    }
  }

  /** Whether this provider has credentials configured — drives the config endpoint. */
  isConfigured(provider: SocialProvider): boolean {
    return this.specs.has(provider);
  }

  /**
   * The public client id for a provider, or `null` when unconfigured.
   *
   * The browser needs this to initialise the provider SDK, and it is
   * public by definition. Serving it from the API rather than duplicating
   * it into a `NEXT_PUBLIC_*` build-time inline keeps one source of
   * truth: a half-configured pair (server set, client unset) otherwise
   * renders a sign-in button that can only ever fail, with nothing
   * anywhere naming the cause.
   */
  clientIdFor(provider: SocialProvider): string | null {
    return this.specs.get(provider)?.audiences[0] ?? null;
  }

  /**
   * Verify a provider id-token and return the identity it asserts.
   *
   * @param expectedNonce when present, the token must carry a matching
   *   `nonce` claim. The browser mints it per sign-in attempt, so a token
   *   captured in flight cannot be replayed against a later attempt.
   */
  async verify(
    provider: SocialProvider,
    idToken: string,
    expectedNonce?: string,
  ): Promise<VerifiedSocialIdentity> {
    const spec = this.specs.get(provider);
    const keySet = this.keySets.get(provider);

    if (!spec || !keySet) {
      throw new ServiceUnavailableException(
        `${labelFor(provider)} sign-in is not available yet. Use your phone number or email instead.`,
      );
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, keySet, {
        issuer: spec.issuers,
        audience: spec.audiences,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        maxTokenAge: MAX_TOKEN_AGE_SECONDS,
      }));
    } catch (err) {
      throw this.mapVerifyError(provider, err);
    }

    if (expectedNonce) {
      if (typeof payload.nonce !== 'string' || !timingSafeEqualStr(payload.nonce, expectedNonce)) {
        throw new UnauthorizedException('That sign-in attempt has expired. Try again.');
      }
    }

    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) {
      // Cannot happen against a real provider; a token that reaches here
      // without one would otherwise link a SocialAccount keyed on ''.
      throw new UnauthorizedException('Sign-in failed. Try again.');
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;

    // Google sends a real boolean; Apple sends the string "true"/"false"
    // in some flows and omits it in others. Apple only ever returns an
    // email it has verified, so treat a present Apple email as verified.
    const rawVerified = payload.email_verified;
    const emailVerified =
      rawVerified === true ||
      rawVerified === 'true' ||
      (provider === SocialProvider.apple && Boolean(email));

    // Google states verification per token, and an unverified address is
    // refused rather than downgraded to "sign in without an email". An
    // address Google will not vouch for must never reach the matching
    // step: that is the input the whole takeover fix turns on. Apple is
    // exempt because it omits the claim entirely on repeat sign-ins and
    // only ever returns addresses it has already verified.
    if (provider === SocialProvider.google && !emailVerified) {
      this.logger.warn('Rejected google id-token: email_verified was not true');
      throw new UnauthorizedException(
        'Google has not verified that email address. Sign in with your phone number instead.',
      );
    }

    return {
      provider,
      providerAccountId: sub,
      email: email || undefined,
      emailVerified,
      name: typeof payload.name === 'string' ? payload.name.trim() || undefined : undefined,
    };
  }

  /**
   * Turn a jose failure into the right status.
   *
   * The split that matters: "this token is bad" (401, and the user should
   * stop trying) versus "we could not check right now" (503, and the user
   * should try again or use another door). A blanket 401 misreports every
   * network blip as a rejected credential.
   */
  private mapVerifyError(provider: SocialProvider, err: unknown): Error {
    const transient =
      err instanceof joseErrors.JWKSTimeout ||
      err instanceof joseErrors.JWKSNoMatchingKey ||
      err instanceof joseErrors.JWKSMultipleMatchingKeys ||
      // Any fetch-layer failure surfaces as a plain Error from the key set.
      (err instanceof Error && !(err instanceof joseErrors.JOSEError));

    if (transient) {
      this.logger.warn(
        `${provider} id-token could not be verified against the provider's keys: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return new ServiceUnavailableException(
        `We could not reach ${labelFor(provider)} just now. Try again, or sign in with your phone number.`,
      );
    }

    // Deliberately terse and identical across causes — an attacker probing
    // signatures learns nothing from the response. The reason is logged,
    // never the token.
    this.logger.warn(
      `Rejected ${provider} id-token: ${err instanceof Error ? err.constructor.name : 'unknown'}`,
    );
    return new UnauthorizedException('That sign-in could not be verified. Try again.');
  }
}

function labelFor(provider: SocialProvider): string {
  return provider === SocialProvider.google ? 'Google' : 'Apple';
}

/** Constant-time compare that tolerates differing lengths. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
