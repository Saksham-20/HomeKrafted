import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { EmailProviderService } from '../notifications/providers/email.provider';
import { SmsProviderService } from '../notifications/providers/sms.provider';

/**
 * How long an approval invite stays usable.
 *
 * Far longer than the 60 minutes a password *reset* gets, and for a
 * different reason. A reset is requested by someone sitting at the form,
 * so an hour is generous. An invite is sent when an **admin** clicks
 * approve, which may be a weekday afternoon while the HomeKrafter is
 * cooking; expecting them to open it within the hour would mean most
 * invites die unread and every one of those becomes a support ticket.
 * Seven days is a working week either side of a weekend.
 */
const INVITE_TTL_DAYS = 7;

/** Per-channel outcome, so the admin screen can say what actually happened. */
export interface InviteChannelResult {
  /** The channel was attempted at all — false when the account has no address/number. */
  attempted: boolean;
  /** A real provider call succeeded. `false` with `attempted: true` means a stub or a failure. */
  delivered: boolean;
  /** The provider is unconfigured, so this was a logged stub. */
  stubbed: boolean;
  /** Provider error, when one was thrown. */
  error?: string;
}

export interface InviteDeliveryReport {
  email: InviteChannelResult;
  sms: InviteChannelResult;
  /** `false` when nothing actually left the building — the admin must be told. */
  reached: boolean;
  /** Only when nothing was delivered: the link itself, so an admin can pass it on by hand. */
  fallbackLink?: string;
}

const NOT_ATTEMPTED: InviteChannelResult = { attempted: false, delivered: false, stubbed: false };

/**
 * Gets a newly approved HomeKrafter into their portal.
 *
 * **The problem this exists to solve.** `approveApplication` mints the
 * account with `authProviders: ['phone']` and no credential of any kind,
 * then posts a welcome notification saying "add your first items from the
 * Listings tab" — into the in-app inbox, which is *behind the login they
 * cannot pass*. Phone OTP was the only way in, and with Twilio unset a
 * real OTP reaches the server log and nowhere else. An approved kitchen
 * could not sign in at all. `CLAUDE.md` has carried this as the standing
 * blocker capping supply growth.
 *
 * **A single-use expiring link, not a password in an email.** The ask was
 * "send them login credentials"; this sends something that *becomes* a
 * credential the moment they use it, which is the same convenience with
 * none of the cost. A mailed password is readable in that inbox forever,
 * cannot be rotated, and on this platform is the credential that can
 * change payout details. The reset machinery is already single-use,
 * expiring and session-revoking (`auth.service.ts#resetPassword`,
 * `password-reset.e2e-spec.ts`), so this reuses it rather than inventing
 * a second way to set a password.
 *
 * **It reports failure honestly.** Both providers degrade to a logged stub
 * when unconfigured and say so via `mock`. Swallowing that would let the
 * admin screen show a confident "approved" for a person who was never
 * contacted — which is the exact failure already in production. When
 * nothing was delivered the report carries the link so an admin can hand
 * it over another way.
 */
@Injectable()
export class SellerInviteService {
  private readonly logger = new Logger(SellerInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly email: EmailProviderService,
    private readonly sms: SmsProviderService,
  ) {}

  /**
   * Mints a fresh invite link for a user.
   *
   * Any earlier unconsumed token is burned first, same rule as
   * `forgotPassword`: re-sending an invite must not leave the previous
   * link working, or a forwarded email still opens the account.
   */
  async createInviteLink(userId: string): Promise<string> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        // Same hash-at-rest rule as the reset flow — the raw token exists
        // only in the message we send.
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const siteUrl = this.configService('siteUrl');
    // `welcome=1` so `/reset-password` can say "set your password" rather
    // than "reset" — nobody approved five minutes ago is *resetting*
    // anything, and copy that implies a password they never had reads as
    // a phishing attempt.
    return `${siteUrl}/reset-password?token=${token}&welcome=1`;
  }

  /** Sends the invite on every channel the account gives us an address for. */
  async sendApprovalInvite(input: {
    userId: string;
    displayName: string;
    email?: string | null;
    phone?: string | null;
  }): Promise<InviteDeliveryReport> {
    const link = await this.createInviteLink(input.userId);
    const siteUrl = this.configService('siteUrl');

    const emailResult = input.email
      ? await this.trySend(() =>
          this.email
            .send(
              input.email as string,
              'Your Homekrafted HomeKrafter account is ready',
              `Hi ${input.displayName},\n\n` +
                `Your application to sell on Homekrafted has been approved — your storefront is live.\n\n` +
                `Set your password and sign in here (the link works once, and expires in ${INVITE_TTL_DAYS} days):\n\n` +
                `${link}\n\n` +
                `After that you can sign in any time at ${siteUrl}/login with this email address.\n\n` +
                `Your first job is to add what you make: open the Listings tab, add your items, ` +
                `and switch them on when you are ready to take orders.\n\n` +
                `— Homekrafted`,
            )
            .then((r) => r.mock),
        )
      : NOT_ATTEMPTED;

    const smsResult = input.phone
      ? await this.trySend(() =>
          this.sms
            .send(
              input.phone as string,
              `Homekrafted: your HomeKrafter account is approved. Set your password and sign in: ${link} ` +
                `(works once, expires in ${INVITE_TTL_DAYS} days)`,
            )
            .then((r) => r.mock),
        )
      : NOT_ATTEMPTED;

    const reached = emailResult.delivered || smsResult.delivered;
    if (!reached) {
      // Loud on purpose. This is the state that used to pass silently.
      this.logger.warn(
        `Approved HomeKrafter ${input.displayName} (user ${input.userId}) was NOT reached — ` +
          `email(attempted=${emailResult.attempted} stub=${emailResult.stubbed} err=${emailResult.error ?? '-'}) ` +
          `sms(attempted=${smsResult.attempted} stub=${smsResult.stubbed} err=${smsResult.error ?? '-'}). ` +
          `They cannot sign in until someone gives them the invite link.`,
      );
    }

    return {
      email: emailResult,
      sms: smsResult,
      reached,
      // Only when nothing landed. Returning it unconditionally would put a
      // live single-use credential into every approval response and every
      // audit log that records one.
      fallbackLink: reached ? undefined : link,
    };
  }

  /** Runs one provider call, turning both "stubbed" and "threw" into data rather than an exception. */
  private async trySend(send: () => Promise<boolean>): Promise<InviteChannelResult> {
    try {
      const stubbed = await send();
      return { attempted: true, delivered: !stubbed, stubbed };
    } catch (err) {
      // A provider outage must not roll back an approval that already
      // happened — same rule as order notifications.
      return {
        attempted: true,
        delivered: false,
        stubbed: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private configService(key: 'siteUrl'): string {
    return this.config.get(key, { infer: true }) as string;
  }
}
