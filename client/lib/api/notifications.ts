import type { Notification, NotificationCategory, NotificationPreference } from "@/lib/types";
import { notificationPreferences, notifications } from "@/lib/data";

export async function getNotifications(): Promise<Notification[]> {
  return notifications;
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  return notificationPreferences;
}

export type NotificationChannelPatch = Partial<
  Pick<NotificationPreference, "sms" | "whatsapp" | "email" | "inapp">
>;

/**
 * Mock preference mutation — mutates the shared `notificationPreferences`
 * row for `category` in place (same session-scoped mock-mutation pattern
 * as `lib/api/addresses.ts`/`lib/api/site.ts#updateUser`). Real
 * server-side persistence (and actually gating delivery per channel)
 * lands with M9's SMS/WhatsApp/email integrations.
 */
export async function updateNotificationPreference(
  category: NotificationCategory,
  patch: NotificationChannelPatch,
): Promise<NotificationPreference> {
  const pref = notificationPreferences.find((p) => p.category === category);
  if (!pref) {
    throw new Error(`No notification preference row for category "${category}"`);
  }
  Object.assign(pref, patch);
  return pref;
}

/** Mock read/unread mutation for the inbox list — mutates the shared `notifications` array in place. */
export async function setNotificationRead(id: string, read: boolean): Promise<Notification | undefined> {
  const notification = notifications.find((n) => n.id === id);
  if (notification) notification.read = read;
  return notification;
}
