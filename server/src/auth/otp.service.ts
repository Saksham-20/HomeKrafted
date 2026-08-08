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
import { EmailProviderService } from '../notifications/providers/email.provider';
import { ParsedIdentifier } from './identifier.util';

/** Wrong guesses allowed against a single issued code. */
const MAX_ATTEMPTS = 5;

/**
 * The three limits below are per *destination*, and they exist because
 * `MAX_ATTEMPTS` alone is not a brute-force control.
 *
 * `MAX_ATTEMPTS` counts against one `OtpChallenge` row. Requesting a new
 * code mints a new row with `attempts: 0`, so before this an attacker got
 * five guesses, asked for another code, got five more, and repeated — the
 * audit confirmed the counter resetting. Against a six-digit space the
 * only thing standing in the way was the IP throttle.
 *
 * `MAX_REQUESTS_PER_WINDOW` also closes the other half of it: nothing
 * capped how many codes one destination could be sent, which is somebody
 * else's phone buzzing all night and our Twilio bill.
 */
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 10;
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * OTP issue + verify, over SMS **or** email.
 *
 * The code goes out through `SmsProviderService.send` (M9, Twilio-shaped)
 * for a phone and `EmailProviderService.send` (SendGrid-shaped) for an
 * address. With real credentials set either is a real message; with the
 * `.env.example` placeholders left in place both degrade to their own
 * logged stub, and this service additionally logs the raw code itself at
 * `warn` (`[OTP STUB]`) purely so dev/login flows keep working without a
 * real provider account — that raw-code line is skipped once delivery is
 * real, since logging a live verification code to the server console
 * would defeat its own purpose.
 *
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
    private readonly emailProvider: EmailProviderService,
  ) {}

  /** Start of the rolling per-destination window the two caps below are counted over. */
  private windowStart(): Date {
    return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  }

  async requestOtp(target: ParsedIdentifier, purpose = 'login'): Promise<void> {
    const destination = target.value;
    const length = this.configService.get('otp.codeLength', { infer: true });
    const ttlSeconds = this.configService.get('otp.ttlSeconds', { infer: true });

    const recentRequests = await this.prisma.otpChallenge.count({
      where: { destination, purpose, createdAt: { gte: this.windowStart() } },
    });
    if (recentRequests >= MAX_REQUESTS_PER_WINDOW) {
      this.logger.warn(`[OTP] request cap hit for ${destination} (purpose=${purpose})`);
      throw new HttpException(
        `Too many verification codes requested. Try again in ${WINDOW_MINUTES} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode(length);
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.otpChallenge.create({
      data: { destination, codeHash, purpose, expiresAt },
    });

    const ttlMinutes = Math.round(ttlSeconds / 60);
    const result =
      target.kind === 'phone'
        ? await this.smsProvider.send(
            destination,
            `Your Homekrafted verification code is ${code}. It expires in ${ttlMinutes} min. Don't share this code.`,
          )
        : await this.emailProvider.send(
            destination,
            `${code} is your Homekrafted code`,
            `Your Homekrafted verification code is ${code}.\n\n` +
              `It expires in ${ttlMinutes} minutes and can only be used once. ` +
              `If you didn't ask for it, you can ignore this email — nothing has changed.\n\n` +
              `— Homekrafted`,
          );

    if (result.mock) {
      // The provider already logged its own stub line without the code
      // (it only sees the rendered message, which does contain it) — this
      // second line exists purely so a developer reading logs doesn't have
      // to parse the message body to find the code during local/dev use.
      this.logger.warn(
        `[OTP STUB] ${destination} -> ${code} (expires in ${ttlSeconds}s, purpose=${purpose})`,
      );
    } else {
      this.logger.log(
        `OTP sent via ${target.kind === 'phone' ? 'SMS' : 'email'} to ${destination} (purpose=${purpose})`,
      );
    }
  }

  /**
   * True when `code` is the configured test code **and** the destination
   * is a phone number on the allowlist that code is scoped to.
   *
   * All three are required, and the allowlist is never implicitly "all":
   * `OTP_TEST_CODE` alone does nothing. That asymmetry is the whole safety
   * property — `verifyOtp` creates an account for an unrecognised
   * destination, so an unscoped fixed code would let anyone sign in as
   * anyone.
   *
   * **Email is never bypassable**, whatever `OTP_TEST_PHONES` holds. The
   * allowlist is a list of phone numbers, and an operator who put an
   * address in it would otherwise hand out a fixed code for a channel the
   * list was never checked against.
   */
  private isTestBypass(target: ParsedIdentifier, code: string): boolean {
    if (target.kind !== 'phone') return false;
    const testCode = this.configService.get('otp.testCode', { infer: true });
    const testPhones = this.configService.get('otp.testPhones', { infer: true });
    if (!testCode || testPhones.length === 0) return false;
    // Timing-safe: this compares an attacker-supplied string against a
    // secret-ish constant, and the allowlist is public-ish by comparison.
    const supplied = Buffer.from(code);
    const expected = Buffer.from(testCode);
    const matches =
      supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    return matches && testPhones.includes(target.value);
  }

  /**
   * @returns `bypassed` — whether the fixed test code was used rather than
   * a real one. The caller needs to know: `AuthService` refuses to issue an
   * admin session from a bypassed verification, so that adding a phone to
   * the test allowlist can never escalate to the admin panel.
   */
  async verifyOtp(
    target: ParsedIdentifier,
    code: string,
    purpose = 'login',
  ): Promise<{ bypassed: boolean }> {
    const destination = target.value;

    if (this.isTestBypass(target, code)) {
      this.logger.warn(
        `[OTP TEST BYPASS] ${destination} verified with the fixed OTP_TEST_CODE (purpose=${purpose}). ` +
          'This is only possible for numbers listed in OTP_TEST_PHONES.',
      );
      // Consume any pending row so a real code issued moments earlier is
      // not left usable afterwards.
      await this.prisma.otpChallenge.updateMany({
        where: { destination, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return { bypassed: true };
    }

    // Counted across every row for this destination in the window, not
    // just the current one — otherwise the budget resets with each new
    // code (see the constants' comment). Checked before the row lookup so
    // a locked-out destination gets the same answer whether or not a code
    // is pending.
    const windowAttempts = await this.prisma.otpChallenge.aggregate({
      where: { destination, purpose, createdAt: { gte: this.windowStart() } },
      _sum: { attempts: true },
    });
    if ((windowAttempts._sum.attempts ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
      this.logger.warn(`[OTP] window attempt cap hit for ${destination} (purpose=${purpose})`);
      throw new HttpException(
        `Too many incorrect attempts. Try again in ${WINDOW_MINUTES} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = await this.prisma.otpChallenge.findFirst({
      where: { destination, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('No pending code for this — request a new one');
    }
    if (otp.expiresAt < new Date()) {
      throw new UnauthorizedException('That code has expired — request a new one');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many incorrect attempts — request a new code');
    }

    const valid = await argon2.verify(otp.codeHash, code);
    if (!valid) {
      await this.prisma.otpChallenge.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Incorrect code');
    }

    await this.prisma.otpChallenge.update({
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
