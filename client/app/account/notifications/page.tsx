import { NotificationsClient } from "@/components/account/NotificationsClient";

/** `/account/notifications` (M7b; M8.4a swap) — both reads are owner-scoped real endpoints now, so `NotificationsClient` fetches them itself on mount instead of this page fetching server-side. */
export default function NotificationsPage() {
  return <NotificationsClient />;
}
