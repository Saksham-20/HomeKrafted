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
import { SocialProvider, User } from '@prisma/client';

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
    const referralCode = await this.uniqueReferralCode(dto.name);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          authProviders: ['email'],
          referralCode,
          referredByCode: dto.referredByCode,
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      await tx.loyaltyAccount.create({ data: { userId: created.id } });
      return created;
    });

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
  // Phone OTP
  // ---------------------------------------------------------------------

  async requestOtp(phone: string): Promise<void> {
    await this.otpService.requestOtp(phone);
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResult> {
    await this.otpService.verifyOtp(dto.phone, dto.code);

    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      const referralCode = await this.uniqueReferralCode(dto.name ?? dto.phone);
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name ?? 'Homekrafted user',
            phone: dto.phone,
            authProviders: ['phone'],
            referralCode,
          },
        });
        await tx.wallet.create({ data: { userId: created.id } });
        await tx.loyaltyAccount.create({ data: { userId: created.id } });
        return created;
      });
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

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      sellerId: seller?.id,
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

  private async uniqueReferralCode(nameSeed: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
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
