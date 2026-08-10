"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Chip } from "@/components/ui/Chip";
import { SellerPageHeader } from "./SellerPageHeader";
import { OrderRow } from "./OrderRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { describeSellerOrderItems, getSellerOrders } from "@/lib/api";
import type { Order, OrderStatus } from "@/lib/types";
import styles from "./MakerOrdersClient.module.css";

const FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

/** `/seller/orders` for `type: "maker"` sellers (M10a) — orders containing at least one of this seller's products, filterable by fulfilment status, newest first. Rendered by `SellerOrdersClient` (M10b's type router) when `seller.type === "maker"`; otherwise unchanged from M10a. */
export function MakerOrdersClient() {
  const { ready, seller } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  useEffect(() => {
    // No vendor storefront means no marketplace orders to fulfil — a
    // laundry partner reaches this screen now that Orders is in the one
    // shared nav, and their work lives under Pickups instead. Derived at
    // render time (`noStorefront`), so this effect just skips.
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getSellerOrders(seller.vendorId!);
        if (cancelled) return;
        setOrders(list);
      } catch (error) {
        if (cancelled) return;
        if (!isForbidden(error)) throw error;
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (noStorefront || unavailable) {
    return <ModuleUnavailable module="Orders" />;
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading your orders…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title="Orders"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} containing your products`}
      />

      <div className={styles.filterRow} role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No orders in this status."
          body="Orders move through placed, packed, shipped and delivered — try another tab. If every tab is empty, nothing has come in yet; sharing your storefront is the fastest way to change that."
          action={{ href: "/seller/listings", label: "Your listings" }}
        />
      ) : (
        <div className={styles.list}>
          {filtered.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              itemsLabel={seller?.vendorId ? describeSellerOrderItems(order, seller.vendorId) : "—"}
              href={`/seller/orders/${order.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
