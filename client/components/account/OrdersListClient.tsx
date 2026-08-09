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
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    getOrderHistory().then((history) => {
      setEntries(history);
      setReady(true);
    });
  }, []);

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
                    className={clsx(styles.status, entry.cancelled && styles.statusCancelled)}
                  >
                    {entry.statusLabel}
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
