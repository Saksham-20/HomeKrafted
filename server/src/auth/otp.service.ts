import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';

const MAX_ATTEMPTS = 5;

/**
 * Phone-OTP issue + verify. The "sender" is a stub for M8.0 — it logs the
 * code to the server console instead of calling a real SMS provider (wire
 * MSG91/Twilio/etc. here in M9, see `.env.example`'s OTP section). Codes
 * are stored hashed (argon2), short-TTL, with a per-row attempt counter so
 * a leaked row can't be brute-forced even before the global throttler
 * kicks in.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig, true>,
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

    // Stub sender: real integration (M9) swaps this for a WhatsApp/SMS
    // Cloud API call behind the same `lib/messaging.ts`-style interface
    // the frontend already documents. Logged at `warn` so it's visible in
    // dev without needing to bump the whole app to debug level.
    this.logger.warn(`[OTP STUB] ${phone} -> ${code} (expires in ${ttlSeconds}s, purpose=${purpose})`);
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
