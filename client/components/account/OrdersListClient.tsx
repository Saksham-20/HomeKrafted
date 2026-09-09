"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Package, Shirt } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { getOrderHistory, type OrderHistoryEntry } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import styles from "./OrdersListClient.module.css";

type Filter = "all" | "order" | "laundry";

/**
 * Laundry was withdrawn in M19 — the route 404s and the create endpoints
 * return 410 — but the models stayed so that existing bookings still
 * render. So the filter is shown to the people who have one and to nobody
 * else: offering "Laundry" to a buyer who has never used it advertises a
 * module that no longer exists, and hiding it from someone with six
 * bookings loses them a way to find their own history.
 */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "order", label: "Marketplace" },
];

const LAUNDRY_FILTER: { value: Filter; label: string } = { value: "laundry", label: "Laundry" };

/**
 * Unified order history list (M7a) — fetches `getOrderHistory()`
 * client-side on mount (not server-fetched by the page) so it can pick up
 * anything placed live earlier in this browser session, on top of the
 * always-present seeded history — see `lib/api/history.ts`'s comment.
 * Same hydration-guard "ready" pattern as `CartContext`/`WalletContext`,
 * just page-scoped instead of a global store.
 */
export function OrdersListClient() {
  const [entries, setEntries] = useState<OrderHistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  /**
   * The read failed, and it is kept apart from "no orders yet" — a
   * screen saying that over somebody's order history is the portal kit's
   * own rule broken. Until 2026-09-06 there was no error state at all
   * and `setReady(true)` lived only in the success callback, so a 5xx or
   * an offline fetch left this page on "Loading your orders…" for ever,
   * with no Try again and an unhandled rejection in the console. (A 401
   * and a 403 PASSWORD_CHANGE_REQUIRED navigate on their own, in
   * `http.ts` — the indefinite hang was every other failure.)
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    getOrderHistory()
      .then((history) => {
        if (cancelled) return;
        setEntries(history);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        // Either way. This is what stops the loading line outliving the
        // request that put it there.
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const visible = entries.filter((entry) => filter === "all" || entry.kind === filter);
  const hasLaundry = entries.some((entry) => entry.kind === "laundry");
  const filters = hasLaundry ? [...FILTERS, LAUNDRY_FILTER] : FILTERS;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Orders</h1>
        <p className={styles.subtitle}>
          {hasLaundry
            ? "Marketplace orders and your past laundry bookings, in one place."
            : "Everything you've ordered, in one place."}
        </p>
      </div>

      <div className={styles.filters}>
        {filters.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onClick={() => setFilter(f.value)}
          />
        ))}
      </div>

      {!ready ? (
        <p className={styles.loading}>Loading your orders…</p>
      ) : loadFailed ? (
        <Card className={styles.empty}>
          <p className={styles.emptyTitle}>We couldn&rsquo;t load your orders</p>
          {/* Names the right party: we cannot tell from here whether it
              is their network or our box, and telling somebody to check a
              connection that is working is what `docs/ERROR-HANDLING.md`
              bans. */}
          <p className={styles.emptyCopy}>
            That&rsquo;s on us, not your connection. Your orders are safe — try again in a moment.
          </p>
          <button
            type="button"
            className={styles.emptyAction}
            onClick={() => {
              setReady(false);
              setReloadToken((token) => token + 1);
            }}
          >
            Try again
          </button>
        </Card>
      ) : visible.length === 0 ? (
        <Card className={styles.empty}>
          {/*
           * Three parts, per the M26 state contract: what is missing, why,
           * and one way out. It previously pointed at Laundry, withdrawn
           * in M19 — so the first screen a new account saw advertised a
           * module whose route 404s.
           */}
          <p className={styles.emptyTitle}>
            {filter === "all" ? "No orders yet" : "Nothing in this filter"}
          </p>
          <p className={styles.emptyCopy}>
            {filter === "all"
              ? "Anything you order will show up here, with its delivery date and status."
              : "Try “All” to see everything you've ordered."}
          </p>
          {filter === "all" && (
            <Link href="/shop" className={styles.emptyAction}>
              Start shopping
            </Link>
          )}
        </Card>
      ) : (
        <div className={styles.list}>
          {visible.map((entry) => (
            <Link key={entry.id} href={`/account/orders/${entry.id}`} className={styles.rowLink}>
              <Card hoverable className={styles.row}>
                <span className={clsx(styles.kindIcon, entry.kind === "laundry" && styles.laundryIcon)}>
                  {entry.kind === "laundry" ? (
                    <Shirt size={18} strokeWidth={1.6} />
                  ) : (
                    <Package size={18} strokeWidth={1.6} />
                  )}
                </span>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.number}>#{entry.number}</span>
                    <span className={styles.date}>{formatDate(entry.date)}</span>
                  </div>
                  <span className={styles.summary}>{entry.summary}</span>
                </div>
                <div className={styles.rowEnd}>
                  <span
                    className={clsx(
                      styles.status,
                      entry.cancelled && styles.statusCancelled,
                      entry.order?.status === "pending-payment" && styles.statusUnpaid,
                    )}
                  >
                    {/* An unpaid order is the one row here that needs the
                        buyer to do something, and "Payment pending" reads
                        as a state somebody else is working on. Say what
                        it wants (2026-09-04); the button itself is on the
                        detail screen, `CompletePaymentPanel`. */}
                    {entry.order?.status === "pending-payment" ? "Finish paying" : entry.statusLabel}
                  </span>
                  <span className={styles.total}>{formatCurrency(entry.total)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
