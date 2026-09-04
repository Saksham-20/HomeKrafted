"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
import { UnifiedOrderRow } from "./UnifiedOrderRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getAllOrdersUnified, type AdminOrderSummary, type AdminOrderType } from "@/lib/api";
import styles from "./OrdersClient.module.css";

const TYPE_FILTERS: { value: AdminOrderType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "marketplace", label: "Marketplace" },
  { value: "snack", label: "Snacks" },
];

/**
 * `/admin/orders` (M11a) — unified, unscoped visibility across the
 * order-shaped tables (marketplace `Order`, `SnackOrder`, legacy
 * `LaundryBooking`), filterable by module + a name/reference search.
 * Read-only here: refund/status-override controls live on the order's
 * own detail screen.
 */
export function OrdersClient() {
  const { ready, role } = useAuth();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<AdminOrderType | "all">("all");
  const [query, setQuery] = useState("");
  // The value the request is actually made with. Typing a reference is
  // now a network call per keystroke unless it settles first.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Both together: a new search term restarts at page one. Staying on
      // page 4 of a result set that now has two rows shows an empty screen
      // and reads as "no orders".
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getAllOrdersUnified({
          type: typeFilter === "all" ? undefined : typeFilter,
          q: debouncedQuery || undefined,
          page,
        });
        if (cancelled) return;
        setOrders(result.items);
        setTotal(result.total);
        setPageSize(result.pageSize);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Couldn’t load orders. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, typeFilter, debouncedQuery, page]);

  const lastPage = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const initialLoad = !ready || (loading && orders.length === 0 && !error);

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle={
          initialLoad
            ? undefined
            : typeFilter === "all" && !debouncedQuery
              ? `${total} order${total === 1 ? "" : "s"} across marketplace and snacks`
              : `${total} order${total === 1 ? "" : "s"} match these filters`
        }
      />

      <Toolbar
        search={
          <SearchField
            placeholder="Search by reference, customer or HomeKrafter…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search orders"
          />
        }
      >
        <SegmentedFilter
          label="Filter by module"
          value={typeFilter}
          onChange={(next) => {
            setTypeFilter(next);
            setPage(1);
          }}
          options={TYPE_FILTERS}
        />
      </Toolbar>

      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : initialLoad ? (
        <LoadingRows rows={6} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders match these filters."
          body="Try the other module, or clear the search. An order appears here the moment a buyer places it."
        />
      ) : (
        <>
          <div className={styles.list}>
            {orders.map((order) => (
              <UnifiedOrderRow key={order.id} order={order} />
            ))}
          </div>
          <Pager page={page} lastPage={lastPage} onChange={setPage} disabled={loading} />
        </>
      )}
    </div>
  );
}
