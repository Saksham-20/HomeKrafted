"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAdminDashboard, type AdminDashboardSnapshot, type AdminOrderType } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import styles from "./AdminDashboardClient.module.css";

const ORDER_TYPE_LABEL: Record<AdminOrderType, string> = {
  marketplace: "Marketplace",
  laundry: "Laundry",
  snack: "Snacks",
};

/**
 * `/admin` Dashboard (M11a) — platform-wide KPI tiles (GMV, orders,
 * active sellers by type, users, pending applications/payouts, wallet
 * liability) plus a simple CSS bar chart of unified orders by module.
 * No chart library per the brief — the bar chart is plain divs sized by
 * percentage of the largest count. Entirely client-side, same reasoning
 * as `MakerDashboardClient`: the data is admin-only and the mock auth
 * store (`useAuth()`) only exists client-side (no server session yet).
 */
export function AdminDashboardClient() {
  const { ready, role } = useAuth();
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  /**
   * "Now", captured once when the snapshot lands.
   *
   * The queue ages below are relative to it, and nothing may read the
   * clock during render — same rule as `lib/occasions.ts`, and the same
   * reason: a component that derives from `Date.now()` while rendering
   * disagrees with itself between server and client (React #418) and is
   * impure for the compiler. Taken alongside the data it describes, so
   * the age is measured against the moment the figures were true.
   */
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const snap = await getAdminDashboard();
      if (cancelled) return;
      setSnapshot(snap);
      setLoadedAt(Date.now());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  if (!ready || loading || !snapshot) {
    return <div className={styles.loading}>Loading platform overview…</div>;
  }

  const maxOrderCount = Math.max(1, ...Object.values(snapshot.ordersByType));

  return (
    <div>
      <AdminPageHeader title="Dashboard" subtitle="Platform-wide overview, unscoped across every HomeKrafter." />

      {snapshot.pendingApplicationsCount > 0 && (
        <Card className={styles.callout}>
          <span className={styles.calloutText}>
            <strong>{snapshot.pendingApplicationsCount}</strong> HomeKrafter application
            {snapshot.pendingApplicationsCount === 1 ? "" : "s"} awaiting review.
          </span>
          <Link href="/admin/sellers">
            <Button variant="secondary" size="sm">
              Review queue
            </Button>
          </Link>
        </Card>
      )}

      {/* Moderation SLA (M27). Directly under the applications callout it
          explains: the count says a queue exists, this says how long
          somebody has been waiting in it. Each half links to the queue
          that clears it, because a metric an operator cannot act on from
          where they read it is a metric they stop reading. */}
      <div className={styles.slaRow}>
        <SlaCard
          label="Oldest application waiting"
          since={snapshot.oldestPendingApplicationAt}
          now={loadedAt}
          count={snapshot.pendingApplicationsCount}
          href="/admin/sellers"
          clearText="No applications waiting"
        />
        {/* `/admin/catalog`, not `/admin/catalog/reviews` — this card is
            about listings awaiting approval, and `/reviews` is the
            *customer review* moderation screen. It sent an operator to the
            wrong queue from M27 until 2026-08-10, and `CLAUDE.md`
            documented the wrong target too. */}
        <SlaCard
          label="Oldest listing waiting"
          since={snapshot.oldestPendingListingAt}
          now={loadedAt}
          count={snapshot.pendingListingsCount ?? 0}
          href="/admin/catalog"
          clearText="No listings waiting review"
        />
      </div>

      <div className={styles.statGrid}>
        <StatCard label="GMV (all modules)" value={formatCurrency(snapshot.gmvTotal)} hint="Marketplace + laundry + snacks" />
        <StatCard label="Orders today" value={String(snapshot.ordersTodayCount)} />
        <StatCard label="Orders total" value={String(snapshot.ordersTotalCount)} />
        <StatCard label="Users" value={String(snapshot.usersCount)} />
        <StatCard
          label="Pending applications"
          value={String(snapshot.pendingApplicationsCount)}
          warn={snapshot.pendingApplicationsCount > 0}
        />
        <StatCard label="Pending payouts" value={formatCurrency(snapshot.pendingPayoutsAmount)} />
        <StatCard
          label="Wallet liability"
          value={formatCurrency(snapshot.walletLiability)}
          hint="See /admin/wallet for per-user balances"
        />
        <StatCard label="Active HomeKrafters" value={String(snapshot.activeHomeKraftersCount)} />
        {/* Specialty counts overlap — one HomeKrafter can appear in several. */}
        <StatCard
          label="Cooking homemade food"
          value={String(snapshot.activeBySpecialty?.homemade_food ?? 0)}
        />
        <StatCard label="Offering laundry" value={String(snapshot.activeBySpecialty?.laundry ?? 0)} />
      </div>

      <h2 className={styles.sectionTitle}>Orders by module</h2>
      <Card className={styles.barChart}>
        {(Object.keys(ORDER_TYPE_LABEL) as AdminOrderType[]).map((type) => {
          const count = snapshot.ordersByType[type];
          const pct = Math.round((count / maxOrderCount) * 100);
          return (
            <div key={type} className={styles.barRow}>
              <span className={styles.barLabel}>{ORDER_TYPE_LABEL[type]}</span>
              <span className={styles.barTrack}>
                {/* Genuinely dynamic value (computed % of the largest count) — same inline-style allowance CLAUDE.md carves out for `<ImageSlot>`'s aspect-ratio, not a static styling shortcut. */}
                <span className={styles.barFill} style={{ width: `${pct}%` }} />
              </span>
              <span className={styles.barCount}>{count}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/**
 * One half of the moderation SLA row.
 *
 * Renders an explicit all-clear rather than a zero: "0 days" reads as a
 * measurement of something, where "No applications waiting" reads as the
 * queue being done, which is the actual state and the one worth
 * recognising.
 */
function SlaCard({
  label,
  since,
  now,
  count,
  href,
  clearText,
}: {
  label: string;
  since?: string;
  /** Captured when the snapshot loaded — never read the clock in render. */
  now: number;
  count: number;
  href: string;
  clearText: string;
}) {
  if (!since || count === 0) {
    return (
      <Card className={styles.slaCard}>
        <span className={styles.slaLabel}>{label}</span>
        <span className={styles.slaClear}>{clearText}</span>
      </Card>
    );
  }

  const days = Math.floor((now - new Date(since).getTime()) / 86_400_000);
  const age = days < 1 ? "Today" : days === 1 ? "1 day" : `${days} days`;

  return (
    <Card className={styles.slaCard}>
      <span className={styles.slaLabel}>{label}</span>
      <span className={clsx(styles.slaValue, days >= 3 && styles.slaWarn)}>{age}</span>
      <Link href={href} className={styles.slaLink}>
        {count} waiting →
      </Link>
    </Card>
  );
}
