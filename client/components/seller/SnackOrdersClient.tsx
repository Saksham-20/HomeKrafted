"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { SellerPageHeader } from "./SellerPageHeader";
import { SnackOrderRow } from "./SnackOrderRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getSnackOrders } from "@/lib/api";
import type { SnackOrder, SnackOrderStatus } from "@/lib/types";
import styles from "./SnackOrdersClient.module.css";
import { Notice } from "@/components/portal/Notice";
import { Button } from "@/components/ui/Button";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
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
        if (isForbidden(error)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty screen. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered the empty state over real data — the
        // M37 dashboard rule, applied to every list (2026-09-04).
        setLoadError(apiErrorMessage(error, "Couldn't load your snack orders. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, reloadToken]);

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  if (!sellerDataReady || loading) {
    return (
      <div>
        <SellerPageHeader title="Orders" />
        <LoadingRows rows={5} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="Orders" />
        <Notice
          tone="danger"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setReloadToken((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
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

      <Toolbar>
        <SegmentedFilter
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            ...f,
            count: f.value === "all" ? orders.length : orders.filter((row) => row.status === f.value).length,
          }))}
        />
      </Toolbar>

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
