import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { SmsProviderService } from '../notifications/providers/sms.provider';

/** Wrong guesses allowed against a single issued code. */
const MAX_ATTEMPTS = 5;

/**
 * The three limits below are per *phone number*, and they exist because
 * `MAX_ATTEMPTS` alone is not a brute-force control.
 *
 * `MAX_ATTEMPTS` counts against one `PhoneOtp` row. Requesting a new code
 * mints a new row with `attempts: 0`, so before this an attacker got five
 * guesses, asked for another code, got five more, and repeated — the audit
 * confirmed the counter resetting. Against a six-digit space the only
 * thing standing in the way was the IP throttle.
 *
 * `MAX_REQUESTS_PER_WINDOW` also closes the other half of it: nothing
 * capped how many codes one number could be sent, which is somebody
 * else's phone buzzing all night and our Twilio bill.
 */
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 10;
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * Phone-OTP issue + verify. The code is always sent through
 * `SmsProviderService.send` (M9, Twilio-shaped) — with real
 * `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` set it's a real SMS; with the
 * `.env.example` placeholders left in place it degrades to that
 * provider's own logged stub, and this service additionally logs the
 * raw code itself at `warn` (`[OTP STUB]`) purely so dev/login flows
 * keep working without a real SMS account — that raw-code line is
 * skipped once delivery is real (see below), since logging a live
 * verification code to the server console would defeat its own purpose.
 * Codes are stored hashed (argon2), short-TTL, with a per-row attempt
 * counter so a leaked row can't be brute-forced even before the global
 * throttler kicks in.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly smsProvider: SmsProviderService,
  ) {}

  /** Start of the rolling per-phone window the two caps below are counted over. */
  private windowStart(): Date {
    return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  }

  async requestOtp(phone: string, purpose = 'login'): Promise<void> {
    const length = this.configService.get('otp.codeLength', { infer: true });
    const ttlSeconds = this.configService.get('otp.ttlSeconds', { infer: true });

    const recentRequests = await this.prisma.phoneOtp.count({
      where: { phone, purpose, createdAt: { gte: this.windowStart() } },
    });
    if (recentRequests >= MAX_REQUESTS_PER_WINDOW) {
      this.logger.warn(`[OTP] request cap hit for ${phone} (purpose=${purpose})`);
      throw new HttpException(
        `Too many verification codes requested. Try again in ${WINDOW_MINUTES} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode(length);
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.phoneOtp.create({
      data: { phone, codeHash, purpose, expiresAt },
    });

    const ttlMinutes = Math.round(ttlSeconds / 60);
    const message = `Your Homekrafted verification code is ${code}. It expires in ${ttlMinutes} min. Don't share this code.`;
    const result = await this.smsProvider.send(phone, message);

    if (result.mock) {
      // `SmsProviderService` already logged its own `[SMS STUB]` line
      // without the code (it only sees the rendered message, which does
      // contain it) — this second line exists purely so a developer
      // reading logs doesn't have to parse the message body to find the
      // code during local/dev use.
      this.logger.warn(`[OTP STUB] ${phone} -> ${code} (expires in ${ttlSeconds}s, purpose=${purpose})`);
    } else {
      this.logger.log(`OTP sent via SMS to ${phone} (purpose=${purpose})`);
    }
  }

  /**
   * True when `code` is the configured test code **and** `phone` is on the
   * allowlist that code is scoped to.
   *
   * Both halves are required, and the allowlist is never implicitly "all":
   * `OTP_TEST_CODE` alone does nothing. That asymmetry is the whole safety
   * property — `verifyOtp` creates an account for an unrecognised number,
   * so an unscoped fixed code would let anyone sign in as anyone.
   */
  private isTestBypass(phone: string, code: string): boolean {
    const testCode = this.configService.get('otp.testCode', { infer: true });
    const testPhones = this.configService.get('otp.testPhones', { infer: true });
    if (!testCode || testPhones.length === 0) return false;
    // Timing-safe: this compares an attacker-supplied string against a
    // secret-ish constant, and the allowlist is public-ish by comparison.
    const supplied = Buffer.from(code);
    const expected = Buffer.from(testCode);
    const matches =
      supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    return matches && testPhones.includes(phone);
  }

  /**
   * @returns `bypassed` — whether the fixed test code was used rather than
   * a real one. The caller needs to know: `AuthService` refuses to issue an
   * admin session from a bypassed verification, so that adding a phone to
   * the test allowlist can never escalate to the admin panel.
   */
  async verifyOtp(phone: string, code: string, purpose = 'login'): Promise<{ bypassed: boolean }> {
    if (this.isTestBypass(phone, code)) {
      this.logger.warn(
        `[OTP TEST BYPASS] ${phone} verified with the fixed OTP_TEST_CODE (purpose=${purpose}). ` +
          'This is only possible for numbers listed in OTP_TEST_PHONES.',
      );
      // Consume any pending row so a real code issued moments earlier is
      // not left usable afterwards.
      await this.prisma.phoneOtp.updateMany({
        where: { phone, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return { bypassed: true };
    }

    // Counted across every row for this number in the window, not just the
    // current one — otherwise the budget resets with each new code (see the
    // constants' comment). Checked before the row lookup so a locked-out
    // number gets the same answer whether or not a code is pending.
    const windowAttempts = await this.prisma.phoneOtp.aggregate({
      where: { phone, purpose, createdAt: { gte: this.windowStart() } },
      _sum: { attempts: true },
    });
    if ((windowAttempts._sum.attempts ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
      this.logger.warn(`[OTP] window attempt cap hit for ${phone} (purpose=${purpose})`);
      throw new HttpException(
        `Too many incorrect attempts. Try again in ${WINDOW_MINUTES} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = await this.prisma.phoneOtp.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('No pending OTP for this phone number — request a new one');
    }
    if (otp.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP has expired — request a new one');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many incorrect attempts — request a new OTP');
    }

    const valid = await argon2.verify(otp.codeHash, code);
    if (!valid) {
      await this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Incorrect OTP code');
    }

    await this.prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    return { bypassed: false };
  }

  private generateCode(length: number): string {
    const max = 10 ** length;
    const n = crypto.randomInt(0, max);
    return n.toString().padStart(length, '0');
  }
}
