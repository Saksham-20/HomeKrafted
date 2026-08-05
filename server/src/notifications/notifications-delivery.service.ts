import { Injectable, Logger } from '@nestjs/common';
import { NotificationCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { SmsProviderService } from './providers/sms.provider';
import { EmailProviderService } from './providers/email.provider';
import { mapNotification } from './notifications.mapper';

export interface DeliverNotificationInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  refType?: string;
  refId?: string;
}

type ChannelKey = 'sms' | 'whatsapp' | 'email' | 'inapp';

/**
 * Turns a notification "event" into actual per-channel deliveries, gated
 * by the target user's `NotificationPreference` for that category — the
 * piece `NotificationsService`'s doc comment flagged as owed to M9
 * ("nothing here sends anything" until now). Callers across the app
 * (wallet ledger events, order/laundry/snack status changes, promos)
 * call `deliver()` instead of writing a bare `prisma.notification.create`
 * — that keeps "does this actually go out" a single, testable seam.
 *
 * One `Notification` row is persisted **per channel actually delivered**
 * — a wallet event with both `sms` and `email` toggled on for that user
 * produces two inbox rows, `channel: "sms"` and `channel: "email"`, so
 * the inbox reflects exactly what went out rather than one row standing
 * in for an ambiguous "all enabled channels." `inapp` never calls an
 * external provider — being "delivered" *is* the persisted row itself.
 * A channel with no contact info on file (no `phone` for sms/whatsapp,
 * no `email` for email) is skipped with a debug log, not an error — the
 * user simply hasn't given us a way to reach them that way yet.
 *
 * One channel's provider throwing (a real, mis-configured, or
 * rate-limited account) is caught and logged per-channel — it never
 * blocks the other enabled channels from still being attempted, and
 * never throws back to the caller (a failed SMS shouldn't roll back the
 * wallet credit / order status transition that triggered it).
 */
@Injectable()
export class NotificationsDeliveryService {
  private readonly logger = new Logger(NotificationsDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsProviderService,
    private readonly whatsapp: WhatsAppService,
    private readonly email: EmailProviderService,
  ) {}

  async deliver(input: DeliverNotificationInput) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      this.logger.warn(`deliver() called for unknown user ${input.userId} — skipped`);
      return [];
    }

    const preference = await this.getOrCreatePreference(input.userId, input.category);
    const channels: Array<{ key: ChannelKey; enabled: boolean }> = [
      { key: 'sms', enabled: preference.sms },
      { key: 'whatsapp', enabled: preference.whatsapp },
      { key: 'email', enabled: preference.email },
      { key: 'inapp', enabled: preference.inapp },
    ];

    const created = [];
    for (const channel of channels) {
      if (!channel.enabled) continue;

      const sent = await this.sendOnChannel(channel.key, user, input);
      if (!sent) continue;

      const row = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          channel: channel.key,
          category: input.category,
          title: input.title,
          body: input.body,
          refType: input.refType,
          refId: input.refId,
        },
      });
      created.push(mapNotification(row));
    }

    return created;
  }

  /** Returns `false` when the channel should be skipped entirely (no contact info, or the provider call failed) — the caller then persists nothing for it. */
  private async sendOnChannel(
    channel: ChannelKey,
    user: { id: string; phone: string | null; email: string | null },
    input: DeliverNotificationInput,
  ): Promise<boolean> {
    try {
      if (channel === 'inapp') return true;

      if (channel === 'sms') {
        if (!user.phone) return this.skipNoContact(channel, user.id);
        await this.sms.send(user.phone, `${input.title}: ${input.body}`);
        return true;
      }

      if (channel === 'whatsapp') {
        if (!user.phone) return this.skipNoContact(channel, user.id);
        await this.whatsapp.sendText(user.phone, `${input.title}: ${input.body}`);
        return true;
      }

      if (channel === 'email') {
        if (!user.email) return this.skipNoContact(channel, user.id);
        await this.email.send(user.email, input.title, input.body);
        return true;
      }

      return false;
    } catch (err) {
      this.logger.error(`${channel} delivery failed for user ${user.id}: ${(err as Error).message}`);
      return false;
    }
  }

  private skipNoContact(channel: ChannelKey, userId: string): false {
    this.logger.debug(`Skipping ${channel} for user ${userId} — no ${channel === 'email' ? 'email' : 'phone'} on file`);
    return false;
  }

  /**
   * Read-then-create on a unique key, made safe for the concurrency this
   * service is actually called with.
   *
   * `deliver()` runs concurrently by design — `OrderNotificationsService`
   * fans out over `Promise.all`, and `OrdersService.create` fires two
   * `void` deliveries back to back. Two of those landing on the same
   * `(userId, category)` before either has written the row means both miss
   * the `findUnique` and both `create`; Postgres rejects the loser with
   * P2002.
   *
   * That threw out of `deliver()` and, because every caller `void`s it, the
   * failure was invisible and the **whole** notification was dropped — not
   * one channel of it. It was showing up as an e2e flake on a different
   * test each run, which is the same bug wearing a different hat: the
   * message a buyer or a kitchen was owed simply never arrived.
   *
   * Losing the race is the ordinary case, not an error: the row the other
   * caller just wrote is exactly the one this call wanted.
   */
  private async getOrCreatePreference(userId: string, category: NotificationCategory) {
    const where = { userId_category: { userId, category } };

    const existing = await this.prisma.notificationPreference.findUnique({ where });
    if (existing) return existing;

    try {
      return await this.prisma.notificationPreference.create({
        data: { userId, category, ...defaultChannelsFor(category) },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.notificationPreference.findUniqueOrThrow({ where });
      }
      throw err;
    }
  }
}

/**
 * What a category is switched on to before anyone touches the toggles
 * (M18).
 *
 * The schema's column defaults are a single set — `inapp` only — which was
 * right while nothing could actually send. It is wrong now: an order
 * confirmation nobody sees until they next open the site is not a
 * confirmation, and in India the message people actually read is WhatsApp.
 *
 * The split is **transactional versus marketing**, not "important versus
 * unimportant". Anything the person is waiting for — an order, a laundry
 * pickup, a snack list, money moving, a security event — reaches them
 * where they are. `promo` stays in-app only, because opting somebody into
 * marketing on a channel as personal as WhatsApp is how a brand gets
 * blocked, and blocking is per-sender rather than per-message: one promo
 * costs every future order update to that person.
 *
 * Every one of these is a *default*, changeable per category at
 * `/account/notifications`.
 */
export function defaultChannelsFor(category: NotificationCategory): {
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
  inapp: boolean;
} {
  if (category === 'promo') {
    return { sms: false, whatsapp: false, email: false, inapp: true };
  }
  // SMS stays off: it duplicates WhatsApp at a per-message cost, and the
  // OTP path is the only place a text is genuinely the right channel.
  return { sms: false, whatsapp: true, email: true, inapp: true };
}
