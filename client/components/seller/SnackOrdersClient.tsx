"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Chip } from "@/components/ui/Chip";
import { SellerPageHeader } from "./SellerPageHeader";
import { SnackOrderRow } from "./SnackOrderRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
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
  const { seller, sellerDataReady } = useAuth();
  const [orders, setOrders] = useState<SnackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<SnackOrderStatus | "all">("all");

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  //
  // `seller` is read through a ref rather than depended on — see the
  // long note in `SellerDashboardClient` for why depending on it fetched
  // twice and re-serialized the very hop this removes (M31).
  const sellerRef = useRef(seller);
  useEffect(() => {
    sellerRef.current = seller;
  }, [seller]);

  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getSnackOrders(sellerRef.current?.id ?? "");
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
  }, [sellerDataReady]);

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  if (!sellerDataReady || loading) {
    return <div className={styles.loading}>Loading your orders…</div>;
  }

  if (unavailable) {
    return <ModuleUnavailable module="Orders" />;
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
        <EmptyState
          title="No orders in this status."
          body="Snack orders arrive over WhatsApp and appear here once recorded. Try another tab — if all of them are empty, none have come in yet."
          action={{ href: "/seller/menu", label: "Your menu" }}
        />
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
