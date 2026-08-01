"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SellerPageHeader } from "./SellerPageHeader";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerAnalytics } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { SellerAnalytics } from "@/lib/types";
import styles from "./SellerAnalyticsClient.module.css";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

/** A change of `null` means there was no comparison window, which is not the same as "no change". */
function formatDelta(value: number | null): { text: string; direction: "up" | "down" | "flat" } {
  if (value === null) return { text: "no earlier period", direction: "flat" };
  const pct = Math.round(value * 100);
  if (pct === 0) return { text: "level with last period", direction: "flat" };
  return {
    text: `${pct > 0 ? "+" : ""}${pct}% vs last period`,
    direction: pct > 0 ? "up" : "down",
  };
}

/**
 * `/seller/analytics` (M16, H6) — "what is selling, and when".
 *
 * The portal had eight screens and none of them answered that. This one
 * is built around the two questions a home cook actually acts on: which
 * item earns, and which days are busy enough to be worth cooking.
 *
 * Charts are the same inline-SVG-and-CSS-bar approach `AnalyticsClient`
 * uses on the admin side — no chart library for six data series.
 */
export function SellerAnalyticsClient() {
  const { ready, seller } = useAuth();
  const [days, setDays] = useState(30);
  const [snapshot, setSnapshot] = useState<SellerAnalytics | undefined>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getSellerAnalytics(days);
        if (cancelled) return;
        if (!data) {
          setUnavailable(true);
          return;
        }
        setSnapshot(data);
      } catch (caught) {
        if (cancelled) return;
        if (!isForbidden(caught)) throw caught;
        setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, days]);

  // Derived rather than a third piece of state. Setting `loading` inside
  // the effect trips `react-hooks/set-state-in-effect`, and the snapshot
  // already carries the window it was computed for — so "is the range I
  // asked for the one I am looking at" is answerable without a flag.
  // Keeping the stale chart on screen while the new range loads also
  // beats blanking the page on every chip press.
  if (unavailable) return <ModuleUnavailable module="Analytics" />;
  if (!ready || !snapshot) {
    return <div className={styles.loading}>Working out your numbers…</div>;
  }

  const { totals, series, topItems, byWeekday } = snapshot;
  const maxRevenue = Math.max(1, ...series.map((p) => p.revenue));
  const maxItemRevenue = Math.max(1, ...topItems.map((i) => i.revenue));
  const maxWeekday = Math.max(1, ...byWeekday.map((w) => w.orderCount));
  const busiest = [...byWeekday].sort((a, b) => b.orderCount - a.orderCount)[0];

  // Same technique as the admin sparkline: points computed from the
  // series, no chart library. Genuinely dynamic values, which is the
  // exception CLAUDE.md carves out for inline style/SVG geometry.
  const sparkWidth = 640;
  const sparkHeight = 72;
  const points = series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * sparkWidth;
      const y = sparkHeight - (p.revenue / maxRevenue) * (sparkHeight - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const revenueDelta = formatDelta(totals.revenueChangePct);
  const orderDelta = formatDelta(totals.orderCountChangePct);
  const nothingYet = totals.orderCount === 0;

  return (
    <div>
      <SellerPageHeader
        title="Analytics"
        subtitle="What is selling, and when — your share of every order, not the whole basket."
        actions={
          <div className={styles.ranges}>
            {RANGES.map((range) => (
              <Chip
                key={range.days}
                label={range.label}
                selected={days === range.days}
                onClick={() => setDays(range.days)}
              />
            ))}
          </div>
        }
      />

      {nothingYet ? (
        <Card className={styles.empty} padding="lg">
          <h2 className={styles.emptyTitle}>Nothing in the last {snapshot.days} days</h2>
          <p>
            No orders landed in this window, so there is nothing to chart yet. Try a longer range,
            or check that your items are switched on under Listings.
          </p>
        </Card>
      ) : (
        <>
          <div className={styles.statGrid}>
            <Card className={styles.stat} padding="md">
              <span className={styles.statLabel}>You earned</span>
              <span className={styles.statValue}>{formatCurrency(totals.revenue)}</span>
              <span className={clsx(styles.statDelta, styles[revenueDelta.direction])}>
                {revenueDelta.text}
              </span>
            </Card>
            <Card className={styles.stat} padding="md">
              <span className={styles.statLabel}>Orders</span>
              <span className={styles.statValue}>{totals.orderCount}</span>
              <span className={clsx(styles.statDelta, styles[orderDelta.direction])}>
                {orderDelta.text}
              </span>
            </Card>
            <Card className={styles.stat} padding="md">
              <span className={styles.statLabel}>Average order</span>
              <span className={styles.statValue}>{formatCurrency(totals.averageOrderValue)}</span>
              <span className={styles.statDelta}>{totals.unitsSold} items sold</span>
            </Card>
            <Card className={styles.stat} padding="md">
              <span className={styles.statLabel}>Ordered again</span>
              <span className={styles.statValue}>{formatPct(totals.repeatRate)}</span>
              <span className={styles.statDelta}>
                {totals.repeatRate === null
                  ? "not enough orders yet"
                  : "of orders came from a returning buyer"}
              </span>
            </Card>
          </div>

          <h2 className={styles.sectionTitle}>What you earned</h2>
          <Card className={styles.sparkCard}>
            <svg
              viewBox={`0 0 ${sparkWidth} ${sparkHeight}`}
              className={styles.sparkSvg}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Your earnings across the last ${snapshot.days} days, ${formatCurrency(totals.revenue)} in total`}
            >
              <polyline points={points} className={styles.sparkLine} fill="none" />
            </svg>
            <div className={styles.sparkAxis}>
              <span>{formatShortDate(snapshot.from)}</span>
              <span>{formatShortDate(snapshot.to)}</span>
            </div>
          </Card>

          <div className={styles.twoCol}>
            <div>
              <h2 className={styles.sectionTitle}>Your busiest days</h2>
              <Card className={styles.barChart}>
                {busiest && busiest.orderCount > 0 && (
                  <p className={styles.chartNote}>
                    {WEEKDAY_LABELS[busiest.weekday]} is your busiest day — worth cooking for.
                  </p>
                )}
                {byWeekday.map((day) => (
                  <div key={day.weekday} className={styles.barRow}>
                    <span className={styles.barLabel}>{WEEKDAY_LABELS[day.weekday]}</span>
                    <span className={styles.barTrack}>
                      <span
                        className={styles.barFill}
                        style={{ width: `${(day.orderCount / maxWeekday) * 100}%` }}
                      />
                    </span>
                    <span className={styles.barCount}>{day.orderCount}</span>
                  </div>
                ))}
              </Card>
            </div>

            <div>
              <h2 className={styles.sectionTitle}>What sells</h2>
              <Card className={styles.barChart}>
                {topItems.length === 0 ? (
                  <p className={styles.chartNote}>
                    No marketplace items sold in this window. Snack and laundry orders count towards
                    your earnings but have no per-item breakdown.
                  </p>
                ) : (
                  topItems.map((item) => (
                    <div key={item.productId} className={styles.barRow}>
                      <span className={styles.barLabelWide} title={item.name}>
                        {item.name}
                      </span>
                      <span className={styles.barTrack}>
                        <span
                          className={styles.barFillGold}
                          style={{ width: `${(item.revenue / maxItemRevenue) * 100}%` }}
                        />
                      </span>
                      <span className={styles.barCount}>
                        {formatCurrency(item.revenue)}
                        <span className={styles.barSub}>{item.unitsSold} sold</span>
                      </span>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>

          <p className={styles.footnote}>
            Earnings here are your share of each order — the lines that are yours, not the whole
            basket a shopper paid for. That is the figure your payouts are worked out from.
            {totals.cancellationRate !== null &&
              ` ${formatPct(totals.cancellationRate)} of your closed orders were cancelled.`}
          </p>
        </>
      )}
    </div>
  );
}
