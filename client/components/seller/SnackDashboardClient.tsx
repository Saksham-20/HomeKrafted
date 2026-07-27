"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, UtensilsCrossed, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "./StatCard";
import { SnackOrderRow } from "./SnackOrderRow";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSnackDashboard, getSnackOrders, type SnackDashboardSnapshot } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { SnackOrder } from "@/lib/types";
import styles from "./SnackDashboardClient.module.css";

const QUICK_LINKS = [
  { label: "Menu", href: "/seller/menu", icon: UtensilsCrossed },
  { label: "Orders", href: "/seller/orders", icon: ShoppingBag },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
];

/**
 * `/seller` Dashboard for `type: "snack"` sellers (M10b) — incoming
 * WhatsApp-origin order count, menu size, delivered-order earnings,
 * pending payout, plus a recent-orders preview. Same client-fetch shape
 * as `MakerDashboardClient`/`PartnerDashboardClient`, rendered by
 * `SellerDashboardClient`'s type router.
 */
export function SnackDashboardClient() {
  const { ready, seller } = useAuth();
  const [snapshot, setSnapshot] = useState<SnackDashboardSnapshot | undefined>(undefined);
  const [recentOrders, setRecentOrders] = useState<SnackOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;

    (async () => {
      const [snap, orders] = await Promise.all([
        getSnackDashboard(seller),
        getSnackOrders(seller.id),
      ]);
      if (cancelled) return;
      setSnapshot(snap);
      setRecentOrders(orders.slice(0, 5));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  if (!ready || loading || !snapshot || !seller) {
    return <div className={styles.loading}>Loading your dashboard…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title={`Hi, ${seller.displayName}`}
        subtitle="Here's how your snack menu is doing."
      />

      <div className={styles.statGrid}>
        <StatCard label="Incoming orders" value={String(snapshot.incomingOrdersCount)} />
        <StatCard label="Menu size" value={String(snapshot.menuSize)} />
        <StatCard label="Earnings (delivered)" value={formatCurrency(snapshot.earnings)} />
        <StatCard
          label="Pending payout"
          value={formatCurrency(snapshot.pendingPayoutAmount)}
          hint="Next settlement"
        />
      </div>

      <div className={styles.quickLinks}>
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Card key={link.href} hoverable padding="none" className={styles.quickLinkCard}>
              <Link href={link.href} className={styles.quickLink}>
                <span className={styles.quickLinkIcon}>
                  <Icon size={17} strokeWidth={1.7} />
                </span>
                {link.label}
              </Link>
            </Card>
          );
        })}
      </div>

      <h2 className={styles.sectionTitle}>Recent orders</h2>
      {recentOrders.length === 0 ? (
        <Card className={styles.emptyState}>No orders yet.</Card>
      ) : (
        <div className={styles.recentList}>
          {recentOrders.map((order) => (
            <SnackOrderRow key={order.id} order={order} href={`/seller/orders/${order.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
