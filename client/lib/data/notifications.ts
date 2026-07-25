import type { Notification, NotificationPreference } from "@/lib/types";

/**
 * Notification inbox seed for the demo user — a mix of read/unread across
 * all 6 `NotificationCategory` values and all 4 `NotificationChannel`
 * values, so `/account/notifications`'s inbox and its per-channel icon
 * mapping both exercise every variant at least once.
 */
export const notifications: Notification[] = [
  {
    id: "ntf1",
    userId: "user-demo",
    channel: "inapp",
    category: "snacks",
    title: "Snack list sent",
    body: "Your snack list was sent on WhatsApp — we'll confirm shortly.",
    read: false,
    createdAt: "2026-07-25T08:15:00+05:30",
  },
  {
    id: "ntf2",
    userId: "user-demo",
    channel: "inapp",
    category: "order",
    title: "Order delivered",
    body: "Your order #HK2043 was delivered. Enjoy!",
    read: false,
    createdAt: "2026-07-24T10:00:00+05:30",
    refType: "order",
    refId: "HK2043",
  },
  {
    id: "ntf3",
    userId: "user-demo",
    channel: "whatsapp",
    category: "laundry",
    title: "Pickup confirmed",
    body: "Your wash & fold pickup is scheduled for tomorrow, 9–11am.",
    read: false,
    createdAt: "2026-07-23T18:20:00+05:30",
  },
  {
    id: "ntf4",
    userId: "user-demo",
    channel: "inapp",
    category: "wallet",
    title: "Cashback credited",
    body: "₹42 cashback credited for order #HK2043.",
    read: true,
    createdAt: "2026-07-18T09:05:00+05:30",
    refType: "walletTransaction",
    refId: "wt1",
  },
  {
    id: "ntf5",
    userId: "user-demo",
    channel: "email",
    category: "promo",
    title: "Festive hampers are live",
    body: "New festive hampers just dropped — free shipping over ₹999.",
    read: true,
    createdAt: "2026-07-15T08:00:00+05:30",
  },
  {
    id: "ntf6",
    userId: "user-demo",
    channel: "sms",
    category: "account",
    title: "New sign-in",
    body: "New sign-in to your Homekrafted account from a Chrome browser.",
    read: true,
    createdAt: "2026-07-05T21:40:00+05:30",
  },
];

/**
 * One row per `NotificationCategory` (default channel opt-ins). Varied
 * deliberately rather than all-true/all-false, so the preference grid on
 * `/account/notifications` reads as a real, considered default rather
 * than a placeholder: transactional categories (order/laundry) default
 * to SMS+WhatsApp+email+in-app, promo defaults to email+in-app only
 * (never SMS/WhatsApp spam by default), account security notices skip
 * WhatsApp.
 */
export const notificationPreferences: NotificationPreference[] = [
  { userId: "user-demo", category: "order", sms: true, whatsapp: true, email: true, inapp: true },
  { userId: "user-demo", category: "laundry", sms: true, whatsapp: true, email: false, inapp: true },
  { userId: "user-demo", category: "snacks", sms: false, whatsapp: true, email: false, inapp: true },
  { userId: "user-demo", category: "wallet", sms: false, whatsapp: false, email: true, inapp: true },
  { userId: "user-demo", category: "promo", sms: false, whatsapp: false, email: true, inapp: true },
  { userId: "user-demo", category: "account", sms: true, whatsapp: false, email: true, inapp: true },
];
