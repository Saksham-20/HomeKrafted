import type { Notification, NotificationCategory, NotificationPreference } from "@/lib/types";
import { notificationPreferences, notifications } from "@/lib/data";
import { http, isMockMode } from "./http";

/** Notifications (M8.4a — real). Owner-scoped; actual delivery is M9 — this only persists + reads (`docs/API.md` "Notifications"). */

export async function getNotifications(): Promise<Notification[]> {
  if (isMockMode()) return notifications;
  return http.get<Notification[]>("/notifications");
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  if (isMockMode()) return notificationPreferences;
  return http.get<NotificationPreference[]>("/notifications/preferences");
}

export type NotificationChannelPatch = Partial<
  Pick<NotificationPreference, "sms" | "whatsapp" | "email" | "inapp">
>;

export async function updateNotificationPreference(
  category: NotificationCategory,
  patch: NotificationChannelPatch,
): Promise<NotificationPreference> {
  if (isMockMode()) {
    const pref = notificationPreferences.find((p) => p.category === category);
    if (!pref) {
      throw new Error(`No notification preference row for category "${category}"`);
    }
    Object.assign(pref, patch);
    return pref;
  }
  return http.patch<NotificationPreference>(
    `/notifications/preferences/${encodeURIComponent(category)}`,
    patch,
  );
}

/** Real mode: `PATCH /notifications/:id/read` — owner-scoped, `404` if it exists but isn't mine (surfaced as `undefined` here, matching the mock's shape). */
export async function setNotificationRead(id: string, read: boolean): Promise<Notification | undefined> {
  if (isMockMode()) {
    const notification = notifications.find((n) => n.id === id);
    if (notification) notification.read = read;
    return notification;
  }
  try {
    return await http.patch<Notification>(`/notifications/${encodeURIComponent(id)}/read`, { read });
  } catch {
    return undefined;
  }
}
