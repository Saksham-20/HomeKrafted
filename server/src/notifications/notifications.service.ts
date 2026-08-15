import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { mapNotification, mapNotificationPreference } from './notifications.mapper';

const ALL_CATEGORIES: NotificationCategory[] = [
  'order',
  'laundry',
  'snacks',
  'wallet',
  'promo',
  'account',
  // M37 — meal-subscription lifecycle + dated-menu changes. Lazy backfill
  // below gives every existing user a row on their next prefs read.
  'meals',
];

/**
 * Owner-scoped (auth). This service is still read/preferences-only — the
 * inbox list, read/unread state, and per-category channel preferences.
 * Actual delivery (SMS/WhatsApp/email sends, gated by
 * `NotificationPreference`) is `NotificationsDeliveryService` (M9,
 * `notifications-delivery.service.ts`) — callers with an event worth
 * notifying a user about inject that service directly rather than
 * writing a bare `prisma.notification.create` themselves.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byCategory = new Map(existing.map((p) => [p.category, p]));

    // Lazily backfill any category with no row yet — same "off/default
    // shape without writing until touched" pattern as
    // `WalletService.getAutoTopup`'s un-persisted default, except here
    // every category realistically needs *a* row to read, so missing
    // ones are created now with the schema's own column defaults.
    const missing = ALL_CATEGORIES.filter((c) => !byCategory.has(c));
    if (missing.length > 0) {
      await this.prisma.notificationPreference.createMany({
        data: missing.map((category) => ({ userId, category })),
        skipDuplicates: true,
      });
      const refreshed = await this.prisma.notificationPreference.findMany({ where: { userId } });
      return refreshed.map(mapNotificationPreference);
    }

    return existing.map(mapNotificationPreference);
  }

  async updatePreference(userId: string, category: NotificationCategory, dto: UpdateNotificationPreferenceDto) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    });

    const updated = existing
      ? await this.prisma.notificationPreference.update({
          where: { userId_category: { userId, category } },
          data: dto,
        })
      : await this.prisma.notificationPreference.create({
          data: { userId, category, ...dto },
        });

    return mapNotificationPreference(updated);
  }

  /**
   * Drop a notification into someone's inbox.
   *
   * Added for the HomeKrafter side: a cook needs to hear about a new order
   * without watching the dashboard, and an applicant needs to hear back
   * about their application. Respects the recipient's per-category
   * preference — if they've muted `order`, this writes nothing rather than
   * filling an inbox they've opted out of.
   *
   * Never throws into the caller's path: an order must not fail because a
   * notification couldn't be written.
   */
  async notify(input: {
    userId: string;
    category: NotificationCategory;
    title: string;
    body: string;
    refType?: string;
    refId?: string;
  }): Promise<void> {
    try {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId_category: { userId: input.userId, category: input.category } },
      });
      if (pref && !pref.inapp) return;

      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          channel: 'inapp',
          category: input.category,
          title: input.title,
          body: input.body,
          refType: input.refType,
          refId: input.refId,
        },
      });
    } catch (err) {
      this.logger.warn(`Could not write notification for user ${input.userId}: ${String(err)}`);
    }
  }

  async listInbox(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapNotification);
  }

  /** Owner-scoped: 404s when the notification exists but belongs to someone else. */
  async setRead(userId: string, id: string, read: boolean) {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.notification.update({ where: { id }, data: { read } });
    return mapNotification(updated);
  }
}
