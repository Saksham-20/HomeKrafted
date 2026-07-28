import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { SmsProviderService } from '../notifications/providers/sms.provider';

const MAX_ATTEMPTS = 5;

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

  async requestOtp(phone: string, purpose = 'login'): Promise<void> {
    const length = this.configService.get('otp.codeLength', { infer: true });
    const ttlSeconds = this.configService.get('otp.ttlSeconds', { infer: true });

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

  async verifyOtp(phone: string, code: string, purpose = 'login'): Promise<void> {
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
  }

  private generateCode(length: number): string {
    const max = 10 ** length;
    const n = crypto.randomInt(0, max);
    return n.toString().padStart(length, '0');
  }
}
