"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import Link from "next/link";
import { Download } from "lucide-react";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  adminExportUrl,
  getAnalytics,
  type AdminAnalyticsSnapshot,
  type AdminExportKind,
  type AdminOrderType,
} from "@/lib/api";
import { formatCurrency, formatShortDate } from "@/lib/format";
import styles from "./AnalyticsClient.module.css";

const ORDER_TYPE_LABEL: Record<AdminOrderType, string> = {
  marketplace: "Marketplace",
  laundry: "Laundry",
  snack: "Snacks",
};

const SELLER_TYPE_LABEL: Record<string, string> = {
  maker: "Maker",
  laundry: "Laundry partner",
  snack: "Snack HomeKrafter",
};

/**
 * `/admin/analytics` (M11b) — GMV over time, orders by module, top
 * sellers/products, new users, wallet flow. **No chart library** — every
 * visualization here is a plain CSS bar (flex-basis % of the largest
 * value in the series, the same recipe `AdminDashboardClient`'s "Orders
 * by module" chart already established) or an inline SVG polyline for
 * the GMV sparkline. All figures are derived from the existing mock data
 * (`lib/api/admin.ts#getAnalytics`) — no new data model.
 */
const RANGES = [
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const EXPORTS: { kind: AdminExportKind; label: string }[] = [
  { kind: "orders", label: "Orders" },
  { kind: "sellers", label: "HomeKrafters" },
  { kind: "payouts", label: "Payouts" },
];

export function AnalyticsClient() {
  const { ready, role } = useAuth();
  const [days, setDays] = useState(14);
  const [snapshot, setSnapshot] = useState<AdminAnalyticsSnapshot | undefined>(undefined);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const snap = await getAnalytics(days);
      if (cancelled) return;
      setSnapshot(snap);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, days]);

  // Derived, not a `loading` flag set inside the effect (which trips
  // `react-hooks/set-state-in-effect`). Keeping the previous chart up
  // while a new range loads also beats blanking the page on every press.
  if (!ready || !snapshot) {
    return (
      <div>
        <AdminPageHeader title="Analytics" />
        <LoadingRows rows={4} />
      </div>
    );
  }

  const maxGmv = Math.max(1, ...snapshot.gmvSeries.map((p) => p.gmv));
  const maxOrderType = Math.max(1, ...Object.values(snapshot.ordersByType));
  const maxSellerRevenue = Math.max(1, ...snapshot.topSellers.map((s) => s.revenue));
  const maxProductRevenue = Math.max(1, ...snapshot.topProducts.map((p) => p.revenue));
  const maxNewUsers = Math.max(1, ...snapshot.newUsersByMonth.map((m) => m.count));
  const gmvTotal = snapshot.gmvSeries.reduce((sum, p) => sum + p.gmv, 0);
  const rangeLabel = `last ${snapshot.days} days`;
  const orderTotal = snapshot.gmvSeries.reduce((sum, p) => sum + p.orderCount, 0);

  // Inline SVG polyline sparkline for the 14-day GMV series — no chart
  // library, just points computed from the series (genuinely dynamic
  // values, same allowance CLAUDE.md carves out for computed % widths).
  const sparkWidth = 560;
  const sparkHeight = 64;
  const points = snapshot.gmvSeries
    .map((p, i) => {
      const x = (i / Math.max(1, snapshot.gmvSeries.length - 1)) * sparkWidth;
      const y = sparkHeight - (p.gmv / maxGmv) * (sparkHeight - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div>
      <AdminPageHeader
        title="Analytics"
        subtitle="Reports across GMV, orders, HomeKrafters, products, users and wallet flow."
        actions={
          <SegmentedFilter
            label="Range"
            value={String(days)}
            onChange={(next) => setDays(Number(next))}
            options={RANGES.map((range) => ({ value: String(range.days), label: range.label }))}
          />
        }
      />

      <Card className={styles.exportBar} padding="sm">
        <span className={styles.exportLabel}>Export CSV</span>
        {EXPORTS.map((item) => (
          <a
            key={item.kind}
            className={styles.exportLink}
            href={adminExportUrl(item.kind, days)}
            // A real download rather than a fetch-to-Blob: the file is
            // built and escaped server-side, so an accountant can be sent
            // the URL instead of a screenshot.
            download
          >
            <Download size={14} strokeWidth={1.8} aria-hidden="true" />
            {item.label}
          </a>
        ))}
        <span className={styles.exportNote}>Covers the selected range.</span>
      </Card>

      <div className={styles.statGrid}>
        <StatCard label={`GMV (${rangeLabel})`} value={formatCurrency(gmvTotal)} />
        <StatCard label={`Orders (${rangeLabel})`} value={String(orderTotal)} />
        <StatCard
          label={`Commission at ${snapshot.commissionPct}% (modelled)`}
          value={formatCurrency(snapshot.modelledCommission)}
        />
        <StatCard label="Wallet credits" value={formatCurrency(snapshot.walletFlow.creditsTotal)} />
        <StatCard label="Wallet debits" value={formatCurrency(snapshot.walletFlow.debitsTotal)} />
        <StatCard
          label="Wallet net flow"
          value={formatCurrency(snapshot.walletFlow.netFlow)}
          warn={snapshot.walletFlow.netFlow < 0}
        />
      </div>

      <p className={styles.modelNote}>
        The commission figure is <strong>modelled over GMV</strong>, not a sum of what was
        deducted — whether payouts actually deduct it is the switch under{" "}
        <Link href="/admin/settings">Settings</Link> (off by default). Change the rate there to see
        what a different one would have earned; the per-payout arithmetic lives on{" "}
        <Link href="/admin/payouts">Payouts</Link>.
      </p>

      <h2 className={styles.sectionTitle}>GMV — {rangeLabel}</h2>
      <Card className={styles.sparkCard}>
        <svg
          viewBox={`0 0 ${sparkWidth} ${sparkHeight}`}
          className={styles.sparkSvg}
          preserveAspectRatio="none"
          role="img"
          aria-label={`GMV over the ${rangeLabel}`}
        >
          <polyline points={points} className={styles.sparkLine} fill="none" />
        </svg>
        <div className={styles.sparkAxis}>
          {snapshot.gmvSeries[0] && <span>{formatShortDate(snapshot.gmvSeries[0].date)}</span>}
          {snapshot.gmvSeries.length > 0 && (
            <span>{formatShortDate(snapshot.gmvSeries[snapshot.gmvSeries.length - 1].date)}</span>
          )}
        </div>
      </Card>

      <div className={styles.twoCol}>
        <div>
          <h2 className={styles.sectionTitle}>Orders by module</h2>
          <Card className={styles.barChart}>
            {(Object.keys(ORDER_TYPE_LABEL) as AdminOrderType[]).map((type) => {
              const count = snapshot.ordersByType[type];
              // Withdrawn module: only rendered while legacy bookings
              // exist to count (the label map stays for those rows).
              if (type === "laundry" && count === 0) return null;
              const pct = Math.round((count / maxOrderType) * 100);
              return (
                <div key={type} className={styles.barRow}>
                  <span className={styles.barLabel}>{ORDER_TYPE_LABEL[type]}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ width: `${pct}%` }} />
                  </span>
                  <span className={styles.barCount}>{count}</span>
                </div>
              );
            })}
          </Card>

          <h2 className={styles.sectionTitle}>New users by month</h2>
          <Card className={styles.barChart}>
            {snapshot.newUsersByMonth.length === 0 ? (
              <p className={styles.hint}>No user data yet.</p>
            ) : (
              snapshot.newUsersByMonth.map((m) => {
                const pct = Math.round((m.count / maxNewUsers) * 100);
                return (
                  <div key={m.month} className={styles.barRow}>
                    <span className={styles.barLabel}>{m.month}</span>
                    <span className={styles.barTrack}>
                      <span className={styles.barFillGold} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.barCount}>{m.count}</span>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Top HomeKrafters</h2>
          <Card className={styles.barChart}>
            {snapshot.topSellers.length === 0 ? (
              <p className={styles.hint}>No revenue yet.</p>
            ) : (
              snapshot.topSellers.map((s) => {
                const pct = Math.round((s.revenue / maxSellerRevenue) * 100);
                return (
                  <div key={s.key} className={styles.barRow}>
                    <span className={styles.barLabelWide}>
                      {s.name}
                      <span className={styles.barSubLabel}>{SELLER_TYPE_LABEL[s.type] ?? s.type}</span>
                    </span>
                    <span className={styles.barTrack}>
                      <span className={styles.barFill} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.barCount}>{formatCurrency(s.revenue)}</span>
                  </div>
                );
              })
            )}
          </Card>

          <h2 className={styles.sectionTitle}>Top products</h2>
          <Card className={styles.barChart}>
            {snapshot.topProducts.length === 0 ? (
              <p className={styles.hint}>No sales yet.</p>
            ) : (
              snapshot.topProducts.map((p) => {
                const pct = Math.round((p.revenue / maxProductRevenue) * 100);
                return (
                  <div key={p.productId} className={styles.barRow}>
                    <span className={styles.barLabelWide}>
                      {p.name}
                      <span className={styles.barSubLabel}>{p.unitsOrdered} sold</span>
                    </span>
                    <span className={styles.barTrack}>
                      <span className={styles.barFillGold} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.barCount}>{formatCurrency(p.revenue)}</span>
                  </div>
                );
              })
            )}
          </Card>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Wallet flow by category</h2>
      <Card className={styles.barChart}>
        {Object.entries(snapshot.walletFlow.byCategory)
          .sort(([, a], [, b]) => b - a)
          .map(([category, amount]) => {
            const maxCategory = Math.max(1, ...Object.values(snapshot.walletFlow.byCategory));
            const pct = Math.round((amount / maxCategory) * 100);
            return (
              <div key={category} className={styles.barRow}>
                <span className={styles.barLabel}>{category}</span>
                <span className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${pct}%` }} />
                </span>
                <span className={styles.barCount}>{formatCurrency(amount)}</span>
              </div>
            );
          })}
      </Card>
    </div>
  );
}
