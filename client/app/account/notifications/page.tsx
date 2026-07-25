import { NotificationsClient } from "@/components/account/NotificationsClient";
import { getNotificationPreferences, getNotifications } from "@/lib/api";

/** `/account/notifications` (M7b) — server data fetch, interactive UI lives in `NotificationsClient`. */
export default async function NotificationsPage() {
  const [notifications, preferences] = await Promise.all([
    getNotifications(),
    getNotificationPreferences(),
  ]);

  return <NotificationsClient initialNotifications={notifications} initialPreferences={preferences} />;
}
