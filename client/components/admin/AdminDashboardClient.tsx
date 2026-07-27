"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const snap = await getAdminDashboard();
      if (cancelled) return;
      setSnapshot(snap);
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
      <AdminPageHeader title="Dashboard" subtitle="Platform-wide overview, unscoped across every seller." />

      {snapshot.pendingApplicationsCount > 0 && (
        <Card className={styles.callout}>
          <span className={styles.calloutText}>
            <strong>{snapshot.pendingApplicationsCount}</strong> seller application
            {snapshot.pendingApplicationsCount === 1 ? "" : "s"} awaiting review.
          </span>
          <Link href="/admin/sellers">
            <Button variant="secondary" size="sm">
              Review queue
            </Button>
          </Link>
        </Card>
      )}

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
        <StatCard label="Active makers" value={String(snapshot.activeSellersByType.maker)} />
        <StatCard label="Active laundry partners" value={String(snapshot.activeSellersByType.laundry)} />
        <StatCard label="Active snack sellers" value={String(snapshot.activeSellersByType.snack)} />
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
