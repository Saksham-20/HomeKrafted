import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { mapNotification, mapNotificationPreference } from './notifications.mapper';

const ALL_CATEGORIES: NotificationCategory[] = ['order', 'laundry', 'snacks', 'wallet', 'promo', 'account'];

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
