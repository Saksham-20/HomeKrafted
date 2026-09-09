"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, Mail, MessageCircle, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import {
  apiErrorMessage,
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
  meals: "Meal plans",
  promo: "Promotions",
  account: "Account & security",
};

/**
 * Every channel, with its label — **total over `NotificationChannel`**.
 *
 * It was a hand-written array until 2026-09-06, so a channel added to the
 * union compiled clean here and shipped a screen with no switch for it:
 * the preference would exist server-side, apply to real messages, and be
 * unreachable. `push` is exactly that addition (plan A7), which is why
 * this is a `Record` — a missing key is now a build failure. `CHANNEL_ICON`
 * below has always been total; the order of the switches comes from
 * `CHANNEL_ORDER`, because `Object.keys` order is not a contract.
 */
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
  inapp: "In-app",
};

const CHANNEL_ORDER: NotificationChannel[] = ["sms", "whatsapp", "email", "inapp"];

const CHANNELS = CHANNEL_ORDER.map((key) => ({ key, label: CHANNEL_LABEL[key] }));

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
  const [error, setError] = useState<string | null>(null);
  /**
   * The first read failed, kept apart from "you have no notifications".
   *
   * `setReady(true)` used to live inside the `then` of an uncaught
   * `Promise.all`, so a rejected read left this screen on "Loading your
   * notifications…" for ever — and `Promise.all` threw away whichever
   * half had answered.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getNotifications(), getNotificationPreferences()])
      .then(([notifs, prefs]) => {
        if (cancelled) return;
        if (notifs.status === "fulfilled") setNotifications(notifs.value);
        if (prefs.status === "fulfilled") setPreferences(prefs.value);
        setLoadFailed(notifs.status === "rejected" || prefs.status === "rejected");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function handleToggle(category: NotificationCategory, channel: NotificationChannel, checked: boolean) {
    const key = `${category}:${channel}`;
    setSavingKey(key);
    setError(null);
    setPreferences((current) =>
      current.map((pref) => (pref.category === category ? { ...pref, [channel]: checked } : pref)),
    );
    try {
      await updateNotificationPreference(category, { [channel]: checked });
    } catch (err) {
      // The switch was flipped optimistically *before* the request, and
      // nothing put it back when the request failed — so a failed save
      // left the page showing a preference the server had never accepted.
      // On a screen whose whole job is "what may we send you", that is the
      // UI stating the opposite of the truth until the next reload.
      setPreferences((current) =>
        current.map((pref) => (pref.category === category ? { ...pref, [channel]: !checked } : pref)),
      );
      setError(apiErrorMessage(err, "Couldn't save that preference. Try again."));
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }

  async function handleToggleRead(notification: Notification) {
    const nextRead = !notification.read;
    setNotifications((current) =>
      current.map((n) => (n.id === notification.id ? { ...n, read: nextRead } : n)),
    );
    try {
      await setNotificationRead(notification.id, nextRead);
    } catch {
      // Same optimistic-update problem, lower stakes — put the dot back
      // rather than showing something as read that the server still has
      // as unread. No message: a read marker is not worth an alert.
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, read: !nextRead } : n)),
      );
    }
  }

  /**
   * Laundry was withdrawn in M19 — `/laundry` 404s and both create
   * endpoints return 410 — but the preference grid iterates the whole
   * `NotificationCategory` enum, so every account was still offered four
   * switches for messages about a service it cannot book. Same defect
   * M26-004 fixed on `/account/orders`, in the one place that screen did
   * not reach.
   *
   * Conditional rather than deleted, for the same reason as there: six
   * real bookings exist, and somebody who made one keeps the ability to
   * turn off messages about it. An account with no laundry notification
   * has nothing to configure and is not shown the row.
   */
  const hasLaundryHistory = notifications.some((n) => n.category === "laundry");
  const visiblePreferences = preferences.filter(
    (pref) => pref.category !== "laundry" || hasLaundryHistory,
  );

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifications = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading your notifications…</p>
      </div>
    );
  }

  if (loadFailed && preferences.length === 0 && notifications.length === 0) {
    // Neither half answered. Never the empty state: "nothing to see here"
    // over a screen deciding what we may send somebody is the wrong
    // answer to give them.
    return (
      <div className={styles.wrap}>
        <Card className={styles.loadFailedCard} role="alert">
          <span className={styles.sectionLabel}>We couldn&rsquo;t load this</span>
          <p className={styles.loadFailedBody}>
            That&rsquo;s on us, not your connection. Your notification settings are unchanged.
          </p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => {
              setReady(false);
              setLoadFailed(false);
              setReloadToken((token) => token + 1);
            }}
          >
            Try again
          </button>
        </Card>
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
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
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
          {visiblePreferences.map((pref) => (
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
            {/* The server caps the inbox read at its latest 50 (M37). */}
            {notifications.length >= 50 && (
              <p className={styles.empty}>Showing your latest 50 notifications.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
