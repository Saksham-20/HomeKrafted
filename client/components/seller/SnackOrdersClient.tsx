"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SellerPageHeader } from "./SellerPageHeader";
import { SnackOrderRow } from "./SnackOrderRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSnackOrders } from "@/lib/api";
import type { SnackOrder, SnackOrderStatus } from "@/lib/types";
import styles from "./SnackOrdersClient.module.css";

const FILTERS: { value: SnackOrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "accepted", label: "Accepted" },
  { value: "out-for-delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
];

/**
 * `/seller/orders` for `type: "snack"` sellers (M10b) — incoming
 * WhatsApp-origin `SnackOrder`s, filterable by status, newest first.
 * Rendered by `SellerOrdersClient`'s type router; mirrors
 * `MakerOrdersClient`'s shape one level down (`SnackOrder`/
 * `SnackOrderStatus` instead of `Order`/`OrderStatus`).
 */
export function SnackOrdersClient() {
  const { ready, seller } = useAuth();
  const [orders, setOrders] = useState<SnackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SnackOrderStatus | "all">("all");

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      const list = await getSnackOrders(seller.id);
      if (cancelled) return;
      setOrders(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  if (!ready || loading) {
    return <div className={styles.loading}>Loading your orders…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title="Orders"
        subtitle={`${orders.length} incoming WhatsApp order${orders.length === 1 ? "" : "s"}`}
      />

      <div className={styles.filterRow} role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className={styles.empty}>No orders in this status.</Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((order) => (
            <SnackOrderRow key={order.id} order={order} href={`/seller/orders/${order.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
