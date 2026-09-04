"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { SellerPageHeader } from "./SellerPageHeader";
import { OrderRow } from "./OrderRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, describeSellerOrderItems, getSellerOrders } from "@/lib/api";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import type { OrderStatus, SellerOrder } from "@/lib/types";
import styles from "./MakerOrdersClient.module.css";
import { Notice } from "@/components/portal/Notice";
import { Button } from "@/components/ui/Button";

type Filter = OrderStatus | "all" | "open";

/**
 * "Open" first: the orders that need a hand today — placed, confirmed,
 * packed — are the reason a kitchen opens this screen in the morning,
 * and a list that starts on "All" makes them scroll past last month's
 * deliveries to find them.
 */
const OPEN_STATUSES: OrderStatus[] = ["placed", "confirmed", "packed"];

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Needs a hand" },
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

/** `/seller/orders` — orders containing at least one of this seller's products, filterable by fulfilment status, newest first. */
export function MakerOrdersClient() {
  const { ready, seller } = useAuth();
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [filter, setFilter] = useState<Filter>("open");

  useEffect(() => {
    // No vendor storefront means no marketplace orders to fulfil — a
    // laundry partner reaches this screen now that Orders is in the one
    // shared nav, and their work lives under Pickups instead. Derived at
    // render time (`noStorefront`), so this effect just skips.
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getSellerOrders(seller.vendorId!, page);
        if (cancelled) return;
        setOrders(result.items);
        setTotal(result.total);
        setPageSize(result.pageSize);
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
        setLoadError(apiErrorMessage(error, "Couldn't load your orders. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, page, reloadToken]);

  const matches = (order: SellerOrder, value: Filter) =>
    value === "all" ? true : value === "open" ? OPEN_STATUSES.includes(order.status) : order.status === value;

  const filtered = useMemo(() => orders.filter((o) => matches(o, filter)), [orders, filter]);
  // Counts over the page in hand — the same rows the filter narrows.
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, orders.filter((o) => matches(o, f.value)).length])),
    [orders],
  );

  const noStorefront = ready && !!seller && !seller.vendorId;
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

  if (noStorefront || unavailable) {
    return <ModuleUnavailable module="Orders" />;
  }

  if (!ready || loading) {
    return (
      <div>
        <SellerPageHeader title="Orders" />
        <LoadingRows rows={5} showLabel label={kitchenLoading("seller/orders", MAKER_LOADING)} />
      </div>
    );
  }

  return (
    <div>
      <SellerPageHeader
        title="Orders"
        subtitle={`${total} order${total === 1 ? "" : "s"} containing your products${
          counts.open > 0 ? ` · ${counts.open} need a hand` : ""
        }`}
      />

      <Toolbar>
        <SegmentedFilter
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
        />
      </Toolbar>

      {filtered.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "Nothing needs a hand right now." : "No orders in this status."}
          body={
            filter === "open"
              ? "Every order you have is on its way or done. New ones land here the moment they are placed."
              : "Orders move through placed, packed, shipped and delivered — try another filter. If every one is empty, nothing has come in yet; sharing your storefront is the fastest way to change that."
          }
          action={filter === "open" ? undefined : { href: "/seller/listings", label: "Your products" }}
        />
      ) : (
        <div className={styles.list}>
          {filtered.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              itemsLabel={describeSellerOrderItems(order)}
              href={`/seller/orders/${order.id}`}
            />
          ))}
        </div>
      )}

      {/* The status filter narrows the current page, so the pager stays
          visible under a filtered view — the next 50 may hold more. */}
      <Pager page={page} lastPage={Math.max(1, Math.ceil(total / pageSize))} onChange={setPage} disabled={loading} />
    </div>
  );
}
