"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ShoppingBag, Star, Store, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "./StatCard";
import { OrderRow } from "./OrderRow";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  describeSellerOrderItems,
  getSellerDashboard,
  getSellerOrders,
  type SellerDashboardSnapshot,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./MakerDashboardClient.module.css";

const QUICK_LINKS = [
  { label: "Listings", href: "/seller/listings", icon: Package },
  { label: "Orders", href: "/seller/orders", icon: ShoppingBag },
  { label: "Storefront", href: "/seller/storefront", icon: Store },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
  { label: "Reviews", href: "/seller/reviews", icon: Star },
];

/**
 * `/seller` Dashboard for `type: "maker"` sellers (M10a) — snapshot tiles
 * (today's orders/revenue, pending payout, low stock, rating) + quick
 * links + a recent-orders preview. Entirely client-side: the data is
 * owner-scoped to whichever seller `useAuth()` reports, and the mock
 * auth store only exists on the client (no server session yet, see
 * `AuthContext`'s file header) — so there's no server component here to
 * pre-fetch anything with. Rendered by `SellerDashboardClient` (M10b's
 * type router) when `seller.type === "maker"`; this file is otherwise
 * unchanged from M10a.
 */
export function MakerDashboardClient() {
  const { ready, seller } = useAuth();
  const [snapshot, setSnapshot] = useState<SellerDashboardSnapshot | undefined>(undefined);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;

    (async () => {
      const [snap, orders] = await Promise.all([
        getSellerDashboard(seller),
        seller.vendorId ? getSellerOrders(seller.vendorId) : Promise.resolve<Order[]>([]),
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
        subtitle="Here's how your storefront is doing."
      />

      <div className={styles.statGrid}>
        <StatCard label="Today's orders" value={String(snapshot.todayOrdersCount)} />
        <StatCard label="Today's revenue" value={formatCurrency(snapshot.todayRevenue)} />
        <StatCard
          label="Pending payout"
          value={formatCurrency(snapshot.pendingPayoutAmount)}
          hint="Next settlement"
        />
        <StatCard
          label="Low stock"
          value={String(snapshot.lowStockCount)}
          warn={snapshot.lowStockCount > 0}
          hint={snapshot.lowStockCount > 0 ? "SKUs under 15 units" : "All stocked up"}
        />
        <StatCard
          label="Rating"
          value={snapshot.rating > 0 ? snapshot.rating.toFixed(1) : "—"}
          hint={`${snapshot.reviewCount} reviews`}
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
        <div className={styles.recentOrders}>
          {recentOrders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              itemsLabel={
                seller.vendorId ? describeSellerOrderItems(order, seller.vendorId) : "—"
              }
              href={`/seller/orders/${order.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
