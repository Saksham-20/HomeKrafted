"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { ProductModerationRow } from "./ProductModerationRow";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getAllProductsAdmin,
  getVendors,
  moderateProduct,
  type AdminProductSummary,
  type ProductModerationAction,
} from "@/lib/api";
import type { Vendor } from "@/lib/types";
import styles from "./CatalogClient.module.css";

type StatusFilter = "all" | "pending" | "active" | "rejected" | "hidden" | "flagged" | "featured";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  // "Waiting" first, and the default (see `useState` below) — since M22 a
  // listing is invisible until someone acts on it, so this is the one
  // filter with a HomeKrafter waiting on the other end of it.
  { value: "pending", label: "Waiting" },
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "flagged", label: "Flagged" },
  { value: "hidden", label: "Taken down" },
  { value: "featured", label: "Featured" },
];

/**
 * `/admin/catalog` (M11b) — every `Product` across every vendor,
 * unscoped, search/filter by vendor + status, with inline
 * approve/hide/flag/feature actions (`moderateProduct`) and an edit link
 * to `/admin/catalog/[id]`. "Take down" is a real soft-delete: hidden
 * products are filtered out of every consumer browse query going forward
 * (see `lib/api/products.ts#isBrowsable`) — those browse pages are Server
 * Components, so the takedown becomes visible on their next server-side
 * fetch, not necessarily this same client tab (see `lib/api/admin.ts`'s
 * "Catalog & review moderation" section header for the full caveat).
 */
export function CatalogClient() {
  const { ready, role } = useAuth();
  const [products, setProducts] = useState<AdminProductSummary[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Bumped after a moderation decision, to re-read the list. A decision
  // changes which filter a listing belongs to and what the queue badge
  // says, and neither is derivable from the row that came back.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
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
        const [result, vendorList] = await Promise.all([
          getAllProductsAdmin({
            status: statusFilter === "all" ? undefined : statusFilter,
            vendorId: vendorFilter === "all" ? undefined : vendorFilter,
            q: debouncedQuery || undefined,
            page,
          }),
          getVendors(),
        ]);
        if (cancelled) return;
        setProducts(result.items);
        setTotal(result.total);
        setPageSize(result.pageSize);
        setPendingCount(result.pendingCount);
        setVendors(vendorList);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, "Couldn’t load the catalogue. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, statusFilter, vendorFilter, debouncedQuery, page, reloadToken]);

  async function handleAction(productId: string, action: ProductModerationAction, reason?: string) {
    setActionError(null);
    try {
      const updated = await moderateProduct(productId, action, reason);
      if (!updated) return;
      // Re-read rather than patch the row in place: a decision moves the
      // listing out of the filter it is being viewed under and changes the
      // waiting count, and the response cannot tell us either.
      setReloadToken((n) => n + 1);
    } catch (err) {
      // Load-bearing now that the server refuses decisions on purpose:
      // without it, a rejection missing its reason is indistinguishable
      // from a click that did nothing.
      setActionError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    }
  }

  const lastPage = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  if (!ready || (loading && products.length === 0 && !loadError)) {
    return <div className={styles.loading}>Loading catalog…</div>;
  }

  return (
    <div>
      {/* The waiting count leads, because it is the only number here with
          somebody's income attached to it. */}
      <AdminPageHeader
        title="Catalog"
        subtitle={(() => {
          // `products.length` was the page, not the catalogue, and
          // "across every vendor" was untrue under any filter — together
          // that read "0 listings across every vendor" while sitting on
          // the Waiting tab of a catalogue with seventeen in it.
          const filtered =
            statusFilter !== "all" || vendorFilter !== "all" || Boolean(debouncedQuery);
          const scope = filtered
            ? `${total} listing${total === 1 ? "" : "s"} match these filters`
            : `${total} listing${total === 1 ? "" : "s"} across every vendor`;
          return pendingCount > 0 ? `${pendingCount} waiting for review · ${scope}` : scope;
        })()}
      />
      <CatalogTabs active="products" />

      <div className={styles.filters}>
        <SearchField
          className={styles.search}
          placeholder="Search by product, vendor or category…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className={styles.select}
          value={vendorFilter}
          onChange={(event) => {
            setVendorFilter(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by vendor"
        >
          <option value="all">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <div className={styles.chipRow} role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={statusFilter === f.value} onClick={() => {
                setStatusFilter(f.value);
                setPage(1);
              }} />
          ))}
        </div>
      </div>

      {actionError && (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      )}

      {loadError && (
        <Card className={styles.empty} role="alert">
          {loadError}
        </Card>
      )}

      {!loadError && products.length === 0 ? (
        <Card className={styles.empty}>
          {statusFilter === "pending"
            ? "Nothing waiting for review. Every listing has been looked at."
            : "No products match these filters."}
        </Card>
      ) : (
        !loadError && (
          <>
            <div className={styles.list}>
              {products.map((product) => (
                <ProductModerationRow key={product.id} product={product} onAction={handleAction} />
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
        )
      )}
    </div>
  );
}
