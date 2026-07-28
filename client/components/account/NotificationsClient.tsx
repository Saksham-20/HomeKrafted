"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, Mail, MessageCircle, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  getNotificationPreferences,
  getNotifications,
  updateNotificationPreference,
  setNotificationRead,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Notification, NotificationCategory, NotificationChannel, NotificationPreference } from "@/lib/types";
import styles from "./NotificationsClient.module.css";

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  order: "Orders",
  laundry: "Laundry",
  snacks: "Snacks",
  wallet: "Wallet",
  promo: "Promotions",
  account: "Account & security",
};

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "inapp", label: "In-app" },
];

const CHANNEL_ICON: Record<NotificationChannel, typeof Bell> = {
  sms: MessageSquare,
  whatsapp: MessageCircle,
  email: Mail,
  inapp: Bell,
};

/**
 * Notifications (M7b; M8.4a real) — per-category channel preference
 * toggles (`updateNotificationPreference`) and a read/unread inbox
 * (`setNotificationRead`), both owner-scoped real endpoints now. Fetches
 * its own initial data on mount (same reasoning as `OrdersListClient` —
 * see `lib/auth/session.ts`'s file header) rather than server-fetched
 * props. The toggle grid reuses the same "styled `<input
 * type=checkbox>`" convention `WalletClient`'s auto-top-up editor already
 * established, rather than inventing a dedicated `ui/` switch primitive
 * for a single consumer.
 */
export function NotificationsClient() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getNotifications(), getNotificationPreferences()]).then(([notifs, prefs]) => {
      if (cancelled) return;
      setNotifications(notifs);
      setPreferences(prefs);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(category: NotificationCategory, channel: NotificationChannel, checked: boolean) {
    const key = `${category}:${channel}`;
    setSavingKey(key);
    setPreferences((current) =>
      current.map((pref) => (pref.category === category ? { ...pref, [channel]: checked } : pref)),
    );
    try {
      await updateNotificationPreference(category, { [channel]: checked });
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }

  async function handleToggleRead(notification: Notification) {
    const nextRead = !notification.read;
    setNotifications((current) =>
      current.map((n) => (n.id === notification.id ? { ...n, read: nextRead } : n)),
    );
    await setNotificationRead(notification.id, nextRead);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifications = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading your notifications…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Notifications</h1>
        <p className={styles.subtitle}>Choose how we reach you, and catch up on updates below.</p>
      </div>

      <Card className={styles.prefsCard}>
        <span className={styles.sectionLabel}>Preferences</span>
        <div className={styles.prefsTable} role="table">
          <div className={clsx(styles.prefsRow, styles.prefsHeadRow)} role="row">
            <span className={styles.prefsCategoryHead} role="columnheader">
              Category
            </span>
            {CHANNELS.map((channel) => (
              <span key={channel.key} className={styles.prefsChannelHead} role="columnheader">
                {channel.label}
              </span>
            ))}
          </div>
          {preferences.map((pref) => (
            <div key={pref.category} className={styles.prefsRow} role="row">
              <span className={styles.prefsCategory} role="rowheader">
                {CATEGORY_LABEL[pref.category]}
              </span>
              {CHANNELS.map((channel) => {
                const key = `${pref.category}:${channel.key}`;
                return (
                  <label key={channel.key} className={styles.prefsCell} role="cell">
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={pref[channel.key]}
                      disabled={savingKey === key}
                      onChange={(event) => handleToggle(pref.category, channel.key, event.target.checked)}
                      aria-label={`${channel.label} notifications for ${CATEGORY_LABEL[pref.category]}`}
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <Card className={styles.inboxCard}>
        <div className={styles.inboxHeader}>
          <span className={styles.sectionLabel}>Inbox</span>
          <div className={styles.filterChips}>
            <Chip label="All" selected={filter === "all"} onClick={() => setFilter("all")} />
            <Chip
              label={`Unread${unreadCount ? ` (${unreadCount})` : ""}`}
              selected={filter === "unread"}
              onClick={() => setFilter("unread")}
            />
          </div>
        </div>

        {visibleNotifications.length === 0 ? (
          <p className={styles.empty}>
            {filter === "unread" ? "You're all caught up." : "No notifications yet."}
          </p>
        ) : (
          <div className={styles.list}>
            {visibleNotifications.map((notification) => {
              const ChannelIcon = CHANNEL_ICON[notification.channel];
              return (
                <button
                  key={notification.id}
                  type="button"
                  className={clsx(styles.notification, !notification.read && styles.unread)}
                  onClick={() => handleToggleRead(notification)}
                >
                  {!notification.read && <span className={styles.dot} aria-hidden="true" />}
                  <span className={styles.notificationIcon} aria-hidden="true">
                    <ChannelIcon size={16} strokeWidth={1.7} />
                  </span>
                  <span className={styles.notificationBody}>
                    <span className={styles.notificationTop}>
                      <span className={styles.notificationTitle}>{notification.title}</span>
                      <span className={styles.notificationDate}>{formatDate(notification.createdAt)}</span>
                    </span>
                    <span className={styles.notificationText}>{notification.body}</span>
                    <span className={styles.notificationMeta}>
                      {CATEGORY_LABEL[notification.category]} · {notification.read ? "Read" : "Mark as read"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
