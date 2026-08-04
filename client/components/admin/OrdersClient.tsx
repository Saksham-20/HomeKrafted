"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { AdminPageHeader } from "./AdminPageHeader";
import { UnifiedOrderRow } from "./UnifiedOrderRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAllOrdersUnified, type AdminOrderSummary, type AdminOrderType } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<AdminOrderType | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const list = await getAllOrdersUnified();
      if (cancelled) return;
      setOrders(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (typeFilter !== "all" && o.type !== typeFilter) return false;
      if (!q) return true;
      return (
        o.reference.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.sellerNames.some((name) => name.toLowerCase().includes(q))
      );
    });
  }, [orders, typeFilter, query]);

  if (!ready || loading) {
    return <div className={styles.loading}>Loading orders…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} across marketplace, laundry and snacks`}
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
            <Chip key={f.value} label={f.label} selected={typeFilter === f.value} onClick={() => setTypeFilter(f.value)} />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className={styles.empty}>No orders match these filters.</Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((order) => (
            <UnifiedOrderRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
