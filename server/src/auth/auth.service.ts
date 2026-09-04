import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ContinueDto } from './dto/continue.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  IdentifierKind,
  ParsedIdentifier,
  parseIdentifier,
} from './identifier.util';
import { SocialLoginDto } from './dto/social-login.dto';
import { SocialTokenVerifier } from './social-token-verifier';
import { NAMED_ATTEMPTS, generateReferralCode } from './referral-code.util';
import { PASSWORD_HASH_OPTIONS } from './hashing';
import { parseDurationToMs } from './duration.util';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { Prisma, SocialProvider, User } from '@prisma/client';
import { EmailProviderService } from '../notifications/providers/email.provider';

/**
 * How long an emailed reset link stays usable.
 *
 * Short on purpose: the token sits in an inbox, and inboxes are the thing
 * that gets breached months later. Long enough that someone can read the
 * mail on their phone and finish on a laptop.
 */
const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * Candidate referral codes tried before giving up.
 *
 * The first `NAMED_ATTEMPTS` of these are the readable `NAME250`…`NAME259`
 * (see `referral-code.util.ts`); the rest are randomly suffixed. That
 * split is the whole point — this constant used to equal the named space
 * exactly, so the eleventh person with a given first name had **no**
 * candidate left and could not register at all. The extra attempts draw
 * from a space of 30⁴, so exhausting them means something else is wrong.
 */
const REFERRAL_CODE_ATTEMPTS = NAMED_ATTEMPTS + 5;

/**
 * A unique violation specifically on `User.referralCode`.
 *
 * Narrowed to that one field on purpose: `User` is also unique on `email`
 * and `phone`, and retrying either of those would loop until it exhausted
 * its attempts and then report a referral-code problem for what is really
 * "this email is taken".
 */
function isReferralCodeCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes('referralCode') : target === 'referralCode';
}

/**
 * Pulls a user's `Seller.id` along with the user row (M31).
 *
 * Every sign-in path already reads the `User`; before this, issuing the
 * token then went back to the database for the seller row separately —
 * a second serial round trip inside the response of every HomeKrafter
 * sign-in and every token refresh. It is one indexed join here.
 */
const SELLER_ID_INCLUDE = { seller: { select: { id: true } } } as const;

/** `null` (not `undefined`) for "this user has no seller row" — see `signTokenPair`. */
function sellerIdOf(user: { seller?: { id: string } | null }): string | null {
  return user.seller?.id ?? null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

/**
 * One provider's availability, as reported to the sign-in page.
 *
 * `clientId` travels with `enabled` on purpose: it is a public value, and
 * serving it here rather than duplicating it into a `NEXT_PUBLIC_*`
 * build-time inline means the two can never disagree. A half-configured
 * pair otherwise renders a button that can only fail.
 */
export interface SocialProviderConfig {
  enabled: boolean;
  clientId: string | null;
}

/** Never leak `passwordHash` (or anything else internal) back to the client. */
export type PublicUser = Pick<
  User,
  | 'id'
  | 'name'
  | 'email'
  | 'phone'
  | 'role'
  | 'referralCode'
  | 'createdAt'
  | 'suspended'
  | 'emailVerified'
  | 'phoneVerified'
  // 2026-09-04. The shopper's own picture — a photo they uploaded or a
  // chef character they picked. Public by definition: it is rendered
  // wherever their name is.
  | 'avatarSrc'
  // M32. The client reads this to send somebody straight to the
  // set-a-password screen; the server does not trust it to — see
  // `JwtAuthGuard`, which refuses every other route regardless.
  | 'mustChangePassword'
  // M47. The admin shell reads this to hide sections a sub-admin cannot
  // reach; the server does not trust it to — `AdminScopeGuard` refuses
  // every route regardless, and reads the row rather than the token so a
  // revoked scope bites immediately.
  | 'adminScopes'
>;

/**
 * What `POST /auth/continue` returns on success.
 *
 * `created` tells the form which of the two things just happened, so it
 * can send a new account straight into "confirm the code we sent you"
 * instead of the account page. It is not derivable client-side: the whole
 * point of one field and one button is that the caller doesn't know in
 * advance whether this is a sign-in or a sign-up.
 */
export interface ContinueResult extends AuthResult {
  created: boolean;
  /** Which channel the identifier resolved to, so the copy can say "phone" or "email". */
  kind: IdentifierKind;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly otpService: OtpService,
    private readonly emailProvider: EmailProviderService,
    private readonly socialTokens: SocialTokenVerifier,
  ) {}

  // ---------------------------------------------------------------------
  // Email + password
  // ---------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, PASSWORD_HASH_OPTIONS);

    const user = await this.createUserWithAccounts(dto.name, (referralCode) => ({
      name: dto.name,
      email: dto.email,
      passwordHash,
      authProviders: ['email'],
      referralCode,
      referredByCode: dto.referredByCode,
    }));

    // An account created a line ago has no seller row — `null`, not
    // `undefined`, so `signTokenPair` doesn't go and look for one.
    return this.issueSession(user, null);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    // The seller id rides along on the lookup we were doing anyway, so
    // `signTokenPair` does not have to go back for it (M31).
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: SELLER_ID_INCLUDE,
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    this.assertNotSuspended(user);

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    this.scheduleRehash(user.id, dto.password, user.passwordHash);

    return this.issueSession(user, sellerIdOf(user));
  }

  // ---------------------------------------------------------------------
  // One field, one password (M25)
  // ---------------------------------------------------------------------

  /**
   * Sign in, or sign up, from a single typed identifier and a password.
   *
   * This is what the Phone/Email × Shopper/HomeKrafter tab grid collapsed
   * into. The caller does not say which it is doing, because the person
   * filling the form does not think in those terms — they type the thing
   * they know and a password.
   *
   * Four outcomes, and the awkward one is third:
   *
   * 1. **Known identifier, right password** → session. Ordinary sign-in.
   * 2. **Known identifier, wrong password** → 401, one message for both
   *    "wrong password" and "no such account with a password", because
   *    telling them apart is an account-existence oracle.
   * 3. **Known identifier, no password set at all** → 409, and a message
   *    that routes them to the code instead. This is the case
   *    `CLAUDE.md` warns about: an approved HomeKrafter's account is
   *    minted without a credential, so "incorrect password" would be a
   *    lie told to every real kitchen on their first visit. A 409 is a
   *    *different status* precisely so the form can offer the OTP route
   *    rather than repeating "wrong password" at somebody who never had
   *    one. It does confirm the account exists — accepted knowingly: the
   *    alternative is a supply-side lockout, and a combined sign-in/
   *    sign-up form leaks existence through the name prompt regardless.
   * 4. **Unknown identifier** → a new account, if a name came with it.
   *    Without one, a 400 asking for it; the form then shows the field
   *    and resubmits.
   */
  async continueWithPassword(dto: ContinueDto): Promise<ContinueResult> {
    const target = this.parseOrThrow(dto.identifier);

    const existing = await this.prisma.user.findUnique({
      where:
        target.kind === 'email' ? { email: target.value } : { phone: target.value },
      include: SELLER_ID_INCLUDE,
    });

    if (existing) {
      this.assertNotSuspended(existing);

      if (!existing.passwordHash) {
        throw new ConflictException(
          target.kind === 'phone'
            ? 'This account does not have a password yet. Continue with a code sent to your phone, and you can set one straight after.'
            : 'This account does not have a password yet. Continue with a code sent to your email, and you can set one straight after.',
        );
      }

      const valid = await argon2.verify(existing.passwordHash, dto.password);
      if (!valid) {
        throw new UnauthorizedException('That password does not match this account.');
      }
      this.scheduleRehash(existing.id, dto.password, existing.passwordHash);

      return {
        ...(await this.issueSession(existing, sellerIdOf(existing))),
        created: false,
        kind: target.kind,
      };
    }

    if (!dto.name) {
      throw new BadRequestException(
        'NAME_REQUIRED: we have not seen this before — tell us your name and we will set the account up.',
      );
    }

    const passwordHash = await argon2.hash(dto.password, PASSWORD_HASH_OPTIONS);
    const user = await this.createUserWithAccounts(dto.name, (referralCode) => ({
      name: dto.name as string,
      ...(target.kind === 'email'
        ? { email: target.value }
        : { phone: target.value }),
      passwordHash,
      // The identifier they chose is the provider they have. `email` is
      // added to a phone account only when they actually set an address.
      authProviders: [target.kind === 'email' ? ('email' as const) : ('phone' as const)],
      referralCode,
      referredByCode: dto.referredByCode,
    }));

    // Send the confirmation code, but never let it fail the signup. The
    // account is already real and usable — verification is a separate,
    // non-blocking fact (see `User.emailVerified`) — so a provider outage,
    // or the per-destination request cap, must not turn a completed
    // sign-up into an error page in front of somebody who now *has* an
    // account and would be told they don't.
    //
    // **Default purpose (`login`), deliberately, not a separate `verify`
    // one.** It was minted as `verify` at first, and the confirm step then
    // could not redeem it: `verifyOtp` reads the `login` purpose, so every
    // new account was shown a code box its own code did not open, failing
    // with "No pending code for this". Caught on the deployed site.
    //
    // Splitting the purposes bought nothing here. The value of a separate
    // purpose is stopping a code minted for one thing being replayed as a
    // sign-in — but this code goes to the identifier this account owns,
    // and redeeming it signs in *that same account*, which the person
    // already is. There is no escalation to prevent.
    void this.otpService
      .requestOtp(target)
      .catch((error: unknown) =>
        this.logger.warn(
          `Could not send the verification code to ${target.value}: ${String(error)}`,
        ),
      );

    // Brand-new account, so there is certainly no seller row to look for.
    return { ...(await this.issueSession(user, null)), created: true, kind: target.kind };
  }

  /** 400 rather than a 500 or a silent miss when the one box holds neither shape. */
  private parseOrThrow(raw: string | undefined): ParsedIdentifier {
    const parsed = raw ? parseIdentifier(raw) : null;
    if (!parsed) {
      throw new BadRequestException(
        'Enter a mobile number or an email address.',
      );
    }
    return parsed;
  }

  // ---------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------

  /**
   * Issues a single-use reset token and emails the link.
   *
   * **Always resolves, whatever the email was.** Reporting "no such
   * account" would turn this endpoint into an account-existence oracle
   * anyone can query — on a marketplace, that leaks which of your
   * customers shop here. The caller gets one fixed message either way, so
   * the only difference between a hit and a miss is invisible from
   * outside.
   *
   * Any earlier unconsumed token is invalidated first: requesting a second
   * link must not leave the first one working, or forwarding an old email
   * still opens the account.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Suspended accounts get nothing — a reset must not be a way back in
    // for an account an admin has closed.
    if (!user || user.suspended) return;

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const ttlMs = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    const siteUrl = this.configService.get('siteUrl', { infer: true });
    const link = `${siteUrl}/reset-password?token=${token}`;

    await this.emailProvider.send(
      email,
      'Reset your Homekrafted password',
      `Hi ${user.name},\n\n` +
        `Someone asked to reset the password for your Homekrafted account. ` +
        `If that was you, open this link within ${PASSWORD_RESET_TTL_MINUTES} minutes:\n\n` +
        `${link}\n\n` +
        `The link can only be used once. If it wasn't you, you can ignore this ` +
        `email — nothing has changed and your current password still works.\n\n` +
        `— Homekrafted`,
    );
  }

  /**
   * Consumes the token and sets the new password.
   *
   * Three things happen together, and all three matter:
   * 1. the token is marked consumed, so the emailed link is dead afterwards;
   * 2. `email` joins `authProviders` — a HomeKrafter approved without a
   *    password is exactly who needs this, and their account would
   *    otherwise still claim to be phone-only;
   * 3. **every refresh token is revoked.** Resetting a password is what
   *    someone does when they think the account is compromised, so leaving
   *    the attacker's existing session alive would defeat the point.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });

    // One message for every failure mode — expired, already used, never
    // existed. Telling them apart tells an attacker holding a stale link
    // whether it was ever real.
    const invalid = new UnauthorizedException(
      'This reset link is no longer valid. Request a new one.',
    );
    if (!stored || stored.consumedAt || stored.expiresAt < new Date()) throw invalid;
    if (stored.user.suspended) throw invalid;

    const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
    const authProviders = stored.user.authProviders.includes('email')
      ? stored.user.authProviders
      : [...stored.user.authProviders, 'email' as const];

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.userId },
        data: {
          passwordHash,
          authProviders,
          // The other way an issued credential dies (M32): somebody who
          // uses the emailed link rather than the temporary password has
          // still chosen their own — the forced-change gate must let
          // them through.
          mustChangePassword: false,
          credentialsClaimedAt: stored.user.credentialsClaimedAt ?? new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * An authenticated password change — and the way an admin-issued
   * temporary credential is retired (M32).
   *
   * Three things happen together, and the third is the point:
   * 1. the current password is verified, so holding a session is not
   *    enough to take the account over;
   * 2. `mustChangePassword` is cleared, which is what lets the account
   *    out of the gate `JwtAuthGuard` holds it in;
   * 3. **every existing session is revoked, and the caller is handed a
   *    fresh one.** A temporary password was known to an admin, so any
   *    session opened with it — including one the admin opened — has to
   *    die the moment its owner chooses their own. Revoking the lot and
   *    re-issuing is what makes that true without bouncing the person who
   *    just set the password back to the sign-in form; they swap to the
   *    returned tokens and carry on.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    this.assertNotSuspended(user);

    if (!user.passwordHash) {
      // Nothing to compare against. This account signs in by code, so the
      // way to *gain* a password is the reset link, which proves the
      // address or number instead.
      throw new BadRequestException(
        'This account does not have a password yet. Use the emailed link to set one.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException('That password does not match this account.');
    }

    // Refusing a no-op change matters more here than it looks: the whole
    // reason this screen is forced is that somebody else knows the old
    // password, so "changing" it to itself would clear the flag while
    // leaving that person's credential working.
    if (await argon2.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException('Choose a password you have not used for this account before.');
    }

    const passwordHash = await argon2.hash(newPassword, PASSWORD_HASH_OPTIONS);

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          // The issued credential is gone the moment its owner replaces
          // it — from here on `claimedAt` is what tells the admin panel
          // this kitchen really arrived.
          credentialsClaimedAt: user.credentialsClaimedAt ?? new Date(),
          // They have just proved they hold whatever channel the
          // credential was handed over on, and an account that signs in
          // with a password is no longer phone-only — same reasoning as
          // `resetPassword`.
          authProviders:
            user.authProviders.includes('email') || !user.email
              ? user.authProviders
              : [...user.authProviders, 'email' as const],
        },
        include: SELLER_ID_INCLUDE,
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Issued after the revocation above, so the new pair is the only one
    // alive. Without this the caller would have just locked themselves
    // out with their own password change.
    return this.issueSession(updated, sellerIdOf(updated));
  }

  // ---------------------------------------------------------------------
  // Phone OTP
  // ---------------------------------------------------------------------

  async requestOtp(dto: RequestOtpDto): Promise<IdentifierKind> {
    const target = this.parseOrThrow(dto.identifier ?? dto.phone);
    await this.otpService.requestOtp(target);
    return target.kind;
  }

  /**
   * Verify a code, and sign in on the strength of it.
   *
   * A code proves the person holds the address or the number, so it does
   * two things at once: it lands a session, and it stamps
   * `emailVerified`/`phoneVerified`. Those are the same fact.
   *
   * **This is still a first-class way in, and must stay one.** M25 moved
   * the *form* to password-first, which is what makes verification the
   * headline use — but an approved HomeKrafter's account is created
   * without a password, and until they set one this endpoint is the only
   * door they have. Removing it because "OTP is just for verification now"
   * would lock out every kitchen the platform is trying to onboard.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResult> {
    const target = this.parseOrThrow(dto.identifier ?? dto.phone);
    // Default purpose, matching what every path that *issues* a code uses
    // — see the note in `continueWithPassword` on why the post-sign-up
    // code is not minted under a separate one.
    const { bypassed } = await this.otpService.verifyOtp(target, dto.code);

    const found = await this.prisma.user.findUnique({
      where: target.kind === 'email' ? { email: target.value } : { phone: target.value },
      include: SELLER_ID_INCLUDE,
    });
    let user: User | null = found;
    // Known only on the existing-account branch; a new account has none.
    const sellerId = found ? sellerIdOf(found) : null;

    // The fixed test code exists so the OTP flow can be exercised without a
    // live SMS account. It must never become a route into the admin panel:
    // an operator adding their own number to `OTP_TEST_PHONES` for a
    // five-minute test would otherwise hand full admin to anyone who knows
    // a six-digit constant. Refused here rather than in `OtpService` because
    // only this layer has resolved the account behind the number.
    if (bypassed && user?.role === 'admin') {
      throw new UnauthorizedException(
        'Admin accounts cannot sign in with the test OTP code — use email and password',
      );
    }

    const provider = target.kind === 'email' ? ('email' as const) : ('phone' as const);
    const verifiedField = target.kind === 'email' ? 'emailVerified' : 'phoneVerified';

    if (!user) {
      user = await this.createUserWithAccounts(dto.name ?? target.value, (referralCode) => ({
        name: dto.name ?? 'Homekrafted user',
        ...(target.kind === 'email' ? { email: target.value } : { phone: target.value }),
        // Proved in the same request that created the account.
        [verifiedField]: true,
        authProviders: [provider],
        referralCode,
      }));
    } else {
      this.assertNotSuspended(user);

      // Only write when something actually changes (M31). This used to
      // update unconditionally, so every repeat code sign-in — the normal
      // case for a HomeKrafter who has not set a password — wrote a row
      // whose columns already held those exact values, inside the
      // request, for nothing.
      const alreadyVerified = user[verifiedField] === true;
      const alreadyLinked = user.authProviders.includes(provider);
      if (!alreadyVerified || !alreadyLinked) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            [verifiedField]: true,
            ...(alreadyLinked ? {} : { authProviders: { push: provider } }),
          },
        });
      }
    }

    return this.issueSession(user, sellerId);
  }

  // ---------------------------------------------------------------------
  // Social
  // ---------------------------------------------------------------------

  /** What `GET /auth/social/config` reports, so the UI can tell the truth. */
  socialConfig(): Record<Lowercase<keyof typeof SocialProvider>, SocialProviderConfig> {
    const describe = (provider: SocialProvider): SocialProviderConfig => ({
      enabled: this.socialTokens.isConfigured(provider),
      clientId: this.socialTokens.clientIdFor(provider),
    });
    return {
      google: describe(SocialProvider.google),
      apple: describe(SocialProvider.apple),
    };
  }

  /**
   * Sign in with a Google or Apple id-token.
   *
   * Two account-takeover paths met here, and both are closed by rules
   * that are easy to undo by accident:
   *
   * **1. The token is verified, and identity comes only from its claims.**
   * Until M27 this method trusted a posted `email` and issued a session
   * for whatever account matched — including the admin. `SocialTokenVerifier`
   * now checks the signature against the provider's published keys before
   * anything is looked up.
   *
   * **2. An unverified local account is taken over, not inherited.**
   * Verifying the token alone does *not* close the hole, and this is the
   * subtle half. `register` never sets `emailVerified` — only the OTP path
   * does — so an attacker can register `victim@gmail.com` with a password
   * of their choosing and wait. When the real owner later clicks
   * "Continue with Google" with a genuinely valid token, a naive
   * link-by-email hands them a session *inside the attacker's account*,
   * which still has the attacker's password on it. So: auto-link only to
   * an already-verified account; otherwise seize it — revoke every
   * session, drop the password, and stamp the address verified, because
   * the provider has just proved who owns it.
   *
   * Admins are refused outright, matching `verifyOtp`'s refusal of the
   * test-code bypass: it keeps "someone reached the founder's inbox" out
   * of the admin blast radius.
   */
  async socialLogin(provider: SocialProvider, dto: SocialLoginDto): Promise<AuthResult> {
    const identity = await this.socialTokens.verify(provider, dto.idToken, dto.nonce);

    const existingLink = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId: identity.providerAccountId },
      },
      include: { user: true },
    });

    if (existingLink) {
      this.assertNotSuspended(existingLink.user);
      this.assertNotAdmin(existingLink.user, provider);
      return this.issueSession(existingLink.user);
    }

    // Only an address the provider vouches for may be used to find an
    // existing account. An unverified provider email is a claim, not proof.
    const matchableEmail = identity.emailVerified ? identity.email : undefined;
    let user = matchableEmail
      ? await this.prisma.user.findUnique({ where: { email: matchableEmail } })
      : null;

    if (user) {
      this.assertNotSuspended(user);
      this.assertNotAdmin(user, provider);

      const seizing = !user.emailVerified;
      user = await this.prisma.$transaction(async (tx) => {
        if (seizing) {
          // The pre-registration case. Whoever set this password never
          // proved they hold the address; the person in front of us just
          // did. Every existing session dies with the password.
          await tx.refreshToken.deleteMany({ where: { userId: user!.id } });
        }
        await tx.socialAccount.create({
          data: { userId: user!.id, provider, providerAccountId: identity.providerAccountId },
        });
        return tx.user.update({
          where: { id: user!.id },
          data: {
            emailVerified: true,
            ...(seizing ? { passwordHash: null } : {}),
            ...(user!.authProviders.includes(provider as unknown as 'google' | 'apple')
              ? {}
              : { authProviders: { push: provider as unknown as 'google' | 'apple' } }),
          },
        });
      });

      if (seizing) {
        this.logger.warn(
          `Social sign-in seized unverified account ${user.id}: sessions revoked and password cleared after a verified ${provider} token proved ownership of the address.`,
        );
      }
    } else {
      const displayName = identity.name ?? dto.name ?? 'Homekrafted user';
      const referralCode = await this.uniqueReferralCode(displayName);
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: displayName,
            // An unverified provider email is not stored as this account's
            // email: `User.email` is unique and doubles as a login handle,
            // so squatting one here would block the real owner later.
            email: matchableEmail,
            emailVerified: Boolean(matchableEmail),
            authProviders: [provider as unknown as 'google' | 'apple'],
            referralCode,
          },
        });
        await tx.socialAccount.create({
          data: { userId: created.id, provider, providerAccountId: identity.providerAccountId },
        });
        await tx.wallet.create({ data: { userId: created.id } });
        await tx.loyaltyAccount.create({ data: { userId: created.id } });
        return created;
      });
    }

    return this.issueSession(user);
  }

  /**
   * Admins do not sign in through a social provider.
   *
   * Same reasoning as `verifyOtp`'s refusal of the test-code bypass: the
   * admin account can change payout details, so its recovery surface
   * should not extend to "whoever controls that Google inbox". Admins
   * have email and password.
   */
  private assertNotAdmin(user: User, provider: SocialProvider): void {
    if (user.role === 'admin') {
      throw new UnauthorizedException(
        `Admin accounts cannot sign in with ${provider === SocialProvider.google ? 'Google' : 'Apple'} — use email and password.`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Refresh + logout
  // ---------------------------------------------------------------------

  /**
   * Rotating refresh: the presented token is verified + looked up by hash,
   * must be un-revoked and unexpired, then is revoked and replaced by a
   * brand-new row in the same operation. A refresh token that's already
   * been used (revoked) fails outright — that's the reuse-detection signal
   * a stolen-and-replayed token would trip.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is no longer valid — please sign in again');
    }

    // The include matters here as much as on sign-in: a refreshed token
    // that lost its `sellerId` would 403 every `/seller/*` request the
    // moment the first access token expired — fifteen minutes into a
    // HomeKrafter's session, with nothing on screen explaining it.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: SELLER_ID_INCLUDE,
    });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    this.assertNotSuspended(user);

    const pair = await this.signTokenPair(user, sellerIdOf(user));
    const newHash = this.hashToken(pair.refreshToken);
    const refreshTtlMs = parseDurationToMs(this.configService.get('jwt.refreshTtl', { infer: true }));

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt: new Date(Date.now() + refreshTtlMs),
        },
      }),
    ]);

    return pair;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  /**
   * Upgrades a password hashed under older argon2 parameters, in the
   * background, after its owner has just proved they know it.
   *
   * The plaintext is only ever in hand at this instant, so this is the
   * one opportunity to re-hash — hence doing it here rather than in a
   * migration, which cannot re-hash anything (it has only the digests).
   *
   * **Fire-and-forget on purpose**, same shape as the post-signup code
   * send: the sign-in has already succeeded, and a failed rewrite must
   * not turn a correct password into an error. Two sign-ins racing each
   * other is harmless — both write a valid digest of the same password.
   */
  private scheduleRehash(userId: string, password: string, currentHash: string): void {
    void this.maybeRehash(userId, password, currentHash).catch((error: unknown) =>
      this.logger.warn(`Could not re-hash the password for ${userId}: ${String(error)}`),
    );
  }

  /** The awaitable half of `scheduleRehash`, exposed to tests that must not race it. */
  async maybeRehash(userId: string, password: string, currentHash: string): Promise<boolean> {
    if (!argon2.needsRehash(currentHash, PASSWORD_HASH_OPTIONS)) return false;

    const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return true;
  }

  private assertNotSuspended(user: User): void {
    if (user.suspended) {
      throw new UnauthorizedException('This account has been suspended. Contact support.');
    }
  }

  /**
   * @param sellerId The caller's `Seller.id`, when the caller already
   *   read it. `undefined` means "unknown, go and look" — see
   *   `signTokenPair`.
   */
  private async issueSession(user: User, sellerId?: string | null): Promise<AuthResult> {
    const pair = await this.signTokenPair(user, sellerId);
    const refreshTtlMs = parseDurationToMs(this.configService.get('jwt.refreshTtl', { infer: true }));

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(pair.refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { ...pair, user: this.toPublicUser(user) };
  }

  /**
   * @param knownSellerId What the caller already knows about this user's
   *   `Seller` row: an id, or `null` for "looked, there isn't one".
   *   `undefined` means "not looked", and only then is the row read here.
   *
   *   Every sign-in path already fetches the `User`, so it can fetch the
   *   seller id in the same query for free (`include`), which is what the
   *   callers now do — this lookup used to be a second, strictly serial
   *   round trip inside the sign-in response of every HomeKrafter (M31).
   *   The fallback stays because it must: a path that forgets to pass the
   *   id should mint a *correct* token slowly, never a token with no
   *   `sellerId`, which would 403 the whole portal.
   */
  private async signTokenPair(user: User, knownSellerId?: string | null): Promise<TokenPair> {
    const sellerId =
      knownSellerId !== undefined
        ? knownSellerId
        : user.role === 'seller'
          ? ((await this.prisma.seller.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id ?? null)
          : null;

    // `jti` is a per-issuance random nonce, not a real "JWT ID" tied to a
    // stored session — its only job is guaranteeing the signed token is
    // unique even when `sub`/`role`/`sellerId`/`iat`/`exp` are otherwise
    // byte-identical to a token minted for the same user in the same
    // wall-clock second (e.g. two rapid `/auth/refresh` calls). Without it,
    // `refresh()`'s `tokenHash` (a SHA-256 of the full JWT string) collides
    // on the `RefreshToken.tokenHash` unique constraint and the second
    // refresh 500s — this was reproduced live pre-fix.
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      sellerId: sellerId ?? undefined,
      jti: crypto.randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
        expiresIn: this.configService.get('jwt.accessTtl', { infer: true }),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
        expiresIn: this.configService.get('jwt.refreshTtl', { infer: true }),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    // SHA-256 (not argon2) here deliberately — this hash is used for exact
    // equality lookup by index, not password-style verification; argon2
    // would be needlessly slow for a per-request refresh lookup and can't
    // be indexed on anyway.
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Creates a user plus the two rows every user must have, retrying the
   * whole transaction when the referral code collides.
   *
   * **The check-then-insert this replaces did not survive two people
   * signing up at once.** `generateReferralCode` is deterministic on the
   * first name — every "Priya" gets `PRIYA250` on attempt 0 — so two
   * concurrent registrations both queried, both saw the code free, and
   * both inserted. One got a 500 out of a raw Prisma unique violation on
   * `referralCode`, on the signup form, with nothing they could do about
   * it but try again. Found by the audit's concurrency specs, which
   * register their actors in parallel; it is not reachable by clicking
   * the form yourself, and it fires constantly under load.
   *
   * A pre-check cannot fix this — there is no gap-free way to reserve a
   * value you have not inserted yet. So the insert *is* the reservation,
   * and a lost race just tries the next candidate. The pre-check is kept
   * as a fast path so the common case still allocates in one round trip.
   */
  private async createUserWithAccounts(
    nameSeed: string,
    build: (referralCode: string) => Prisma.UserCreateInput,
  ): Promise<User> {
    for (let attempt = 0; attempt < REFERRAL_CODE_ATTEMPTS; attempt += 1) {
      const code =
        attempt === 0
          ? await this.uniqueReferralCode(nameSeed)
          : generateReferralCode(nameSeed, attempt);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data: build(code) });
          await tx.wallet.create({ data: { userId: created.id } });
          await tx.loyaltyAccount.create({ data: { userId: created.id } });
          await this.recordReferralTx(tx, created);
          return created;
        });
      } catch (err) {
        if (isReferralCodeCollision(err)) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique referral code — please retry');
  }

  /**
   * Turns the `referredByCode` a signup was given into an actual
   * `Referral` row.
   *
   * **This link did not exist before the 2026-08-07 audit.**
   * `RegisterDto` accepted `referredByCode`, `User.referredByCode` stored
   * it, and *nothing in the server ever read that column*. No code path
   * anywhere created a `Referral`, so every row on `/account/referrals`
   * came from the seed. A real person could copy their code, watch a
   * friend sign up with it, and the invite would never appear — while the
   * page promised "you both get ₹250".
   *
   * Silent on a bad code, deliberately. Reporting "no such referral code"
   * would make signup an account-existence oracle over the code space,
   * and a mistyped code must not be a reason a signup fails — the account
   * matters more than the referral.
   *
   * Runs inside the signup transaction, so an account never exists with
   * its referral half-recorded.
   */
  private async recordReferralTx(tx: Prisma.TransactionClient, created: User): Promise<void> {
    const code = created.referredByCode?.trim();
    if (!code) return;

    const referrer = await tx.user.findUnique({ where: { referralCode: code } });
    if (!referrer) return;
    // Referring yourself is not a referral. Cheap to attempt — the code is
    // printed on the referrer's own account page.
    if (referrer.id === created.id) return;

    await tx.referral.create({
      data: {
        referrerUserId: referrer.id,
        code,
        refereeUserId: created.id,
        refereeName: created.name,
        // `joined`, not `rewarded`. The money is a separate question with
        // its own gate — the friend's first order has to arrive first
        // (`ReferralsService.applyCredit`).
        status: 'joined',
      },
    });
  }

  /**
   * Fast path only — see `createUserWithAccounts` for why the insert, not
   * this, is what guarantees uniqueness.
   *
   * One query for every candidate rather than one query *per* candidate
   * (M31). The loop this replaces was a sequential round trip per
   * attempt, so a common first name — the case the readable
   * `PRIYA250…PRIYA259` space exists for — cost up to fifteen of them
   * inside the signup request. Since this is only a hint for the insert
   * below, asking about all the candidates at once loses nothing.
   */
  private async uniqueReferralCode(nameSeed: string): Promise<string> {
    const candidates = Array.from({ length: REFERRAL_CODE_ATTEMPTS }, (_, attempt) =>
      generateReferralCode(nameSeed, attempt),
    );

    const taken = await this.prisma.user.findMany({
      where: { referralCode: { in: candidates } },
      select: { referralCode: true },
    });
    const used = new Set(taken.map((row) => row.referralCode));

    const free = candidates.find((code) => !used.has(code));
    if (free) return free;

    throw new ConflictException('Could not allocate a unique referral code — please retry');
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
      suspended: user.suspended,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      avatarSrc: user.avatarSrc,
      mustChangePassword: user.mustChangePassword,
      adminScopes: user.adminScopes,
    };
  }
}
