"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
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
 * `/admin/orders` (M11a) — unified, unscoped visibility across all 3
 * order-shaped tables (marketplace `Order`, `LaundryBooking`,
 * `SnackOrder`), filterable by module + a name/reference search.
 * Read-only here: refund/status-override controls are explicitly M11b
 * scope (see `OrderDetailClient`'s stub note) — this screen is "full
 * visibility" per the M11a brief, not action.
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

  if (!ready || (loading && orders.length === 0 && !error)) {
    return <div className={styles.loading}>Loading orders…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle={
          typeFilter === "all" && !debouncedQuery
            ? `${total} order${total === 1 ? "" : "s"} across marketplace and snacks`
            : `${total} order${total === 1 ? "" : "s"} match these filters`
        }
      />

      <div className={styles.filters}>
        <SearchField
          className={styles.search}
          placeholder="Search by reference, customer or HomeKrafter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.chipRow} role="tablist" aria-label="Filter by module">
          {TYPE_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={typeFilter === f.value} onClick={() => {
                setTypeFilter(f.value);
                setPage(1);
              }} />
          ))}
        </div>
      </div>

      {error ? (
        <Card className={styles.empty} role="alert">
          {error}
        </Card>
      ) : orders.length === 0 ? (
        <Card className={styles.empty}>No orders match these filters.</Card>
      ) : (
        <>
          <div className={styles.list}>
            {orders.map((order) => (
              <UnifiedOrderRow key={order.id} order={order} />
            ))}
          </div>

          {lastPage > 1 && (
            <div className={styles.pager}>
              <Button
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className={styles.pagerLabel} aria-live="polite">
                Page {page} of {lastPage}
              </span>
              <Button
                variant="secondary"
                disabled={page >= lastPage || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
