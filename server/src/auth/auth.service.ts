import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { generateReferralCode } from './referral-code.util';
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

/** Candidate referral codes tried before giving up — `NAME250`, `NAME251`, … */
const REFERRAL_CODE_ATTEMPTS = 10;

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

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

/** Never leak `passwordHash` (or anything else internal) back to the client. */
export type PublicUser = Pick<
  User,
  'id' | 'name' | 'email' | 'phone' | 'role' | 'referralCode' | 'createdAt' | 'suspended'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly otpService: OtpService,
    private readonly emailProvider: EmailProviderService,
  ) {}

  // ---------------------------------------------------------------------
  // Email + password
  // ---------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.createUserWithAccounts(dto.name, (referralCode) => ({
      name: dto.name,
      email: dto.email,
      passwordHash,
      authProviders: ['email'],
      referralCode,
      referredByCode: dto.referredByCode,
    }));

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    this.assertNotSuspended(user);

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    return this.issueSession(user);
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

    const passwordHash = await argon2.hash(password);
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
        data: { passwordHash, authProviders },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ---------------------------------------------------------------------
  // Phone OTP
  // ---------------------------------------------------------------------

  async requestOtp(phone: string): Promise<void> {
    await this.otpService.requestOtp(phone);
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResult> {
    const { bypassed } = await this.otpService.verifyOtp(dto.phone, dto.code);

    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });

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
    if (!user) {
      user = await this.createUserWithAccounts(dto.name ?? dto.phone, (referralCode) => ({
        name: dto.name ?? 'Homekrafted user',
        phone: dto.phone,
        authProviders: ['phone'],
        referralCode,
      }));
    } else {
      this.assertNotSuspended(user);
      if (!user.authProviders.includes('phone')) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { authProviders: { push: 'phone' } },
        });
      }
    }

    return this.issueSession(user);
  }

  // ---------------------------------------------------------------------
  // Social (stub provider — see SocialLoginDto's doc comment)
  // ---------------------------------------------------------------------

  async socialLogin(provider: SocialProvider, dto: SocialLoginDto): Promise<AuthResult> {
    const existingLink = await this.prisma.socialAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: dto.providerAccountId } },
      include: { user: true },
    });

    if (existingLink) {
      this.assertNotSuspended(existingLink.user);
      return this.issueSession(existingLink.user);
    }

    // No linked account yet — match by email if provided, else create new.
    let user = dto.email ? await this.prisma.user.findUnique({ where: { email: dto.email } }) : null;

    if (user) {
      this.assertNotSuspended(user);
      await this.prisma.socialAccount.create({
        data: { userId: user.id, provider, providerAccountId: dto.providerAccountId },
      });
      if (!user.authProviders.includes(provider as unknown as 'google' | 'apple')) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { authProviders: { push: provider as unknown as 'google' | 'apple' } },
        });
      }
    } else {
      const referralCode = await this.uniqueReferralCode(dto.name ?? provider);
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name ?? 'Homekrafted user',
            email: dto.email,
            authProviders: [provider as unknown as 'google' | 'apple'],
            referralCode,
          },
        });
        await tx.socialAccount.create({
          data: { userId: created.id, provider, providerAccountId: dto.providerAccountId },
        });
        await tx.wallet.create({ data: { userId: created.id } });
        await tx.loyaltyAccount.create({ data: { userId: created.id } });
        return created;
      });
    }

    return this.issueSession(user);
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    this.assertNotSuspended(user);

    const pair = await this.signTokenPair(user);
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

  private assertNotSuspended(user: User): void {
    if (user.suspended) {
      throw new UnauthorizedException('This account has been suspended. Contact support.');
    }
  }

  private async issueSession(user: User): Promise<AuthResult> {
    const pair = await this.signTokenPair(user);
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

  private async signTokenPair(user: User): Promise<TokenPair> {
    const seller = user.role === 'seller' ? await this.prisma.seller.findUnique({ where: { userId: user.id } }) : null;

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
      sellerId: seller?.id,
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
          return created;
        });
      } catch (err) {
        if (isReferralCodeCollision(err)) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique referral code — please retry');
  }

  /** Fast path only — see `createUserWithAccounts` for why the insert, not this, is what guarantees uniqueness. */
  private async uniqueReferralCode(nameSeed: string): Promise<string> {
    for (let attempt = 0; attempt < REFERRAL_CODE_ATTEMPTS; attempt += 1) {
      const code = generateReferralCode(nameSeed, attempt);
      const clash = await this.prisma.user.findUnique({ where: { referralCode: code } });
      if (!clash) return code;
    }
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
    };
  }
}
