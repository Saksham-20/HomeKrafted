"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Select } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { ReviewQueuePanel } from "./ReviewQueuePanel";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { ProductModerationRow } from "./ProductModerationRow";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getAllProductsAdmin,
  getTaxonomySuggestions,
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
  const router = useRouter();
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
  /**
   * Shelf and occasion requests waiting (M50). Read here only to badge
   * the tab — nothing else on this screen mentions that queue exists, so
   * without the number a HomeKrafter's request sits unread behind a link
   * nobody has a reason to press.
   */
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
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
        const [result, vendorList, suggestions] = await Promise.all([
          getAllProductsAdmin({
            status: statusFilter === "all" ? undefined : statusFilter,
            vendorId: vendorFilter === "all" ? undefined : vendorFilter,
            q: debouncedQuery || undefined,
            page,
          }),
          getVendors(),
          // Its own failure must not take the catalogue down with it: the
          // badge is a courtesy, the product list is the screen.
          getTaxonomySuggestions("pending").catch(() => ({ items: [], pendingCount: 0 })),
        ]);
        if (cancelled) return;
        setPendingSuggestions(suggestions.pendingCount);
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
  const filtered = statusFilter !== "all" || vendorFilter !== "all" || Boolean(debouncedQuery);

  return (
    <div>
      {/* The waiting count leads, because it is the only number here with
          somebody's income attached to it. */}
      <AdminPageHeader
        title="Catalog"
        subtitle={
          loading && products.length === 0
            ? undefined
            : (() => {
                // `products.length` was the page, not the catalogue, and
                // "across every vendor" was untrue under any filter.
                const scope = filtered
                  ? `${total} listing${total === 1 ? " matches" : "s match"} these filters`
                  : `${total} listing${total === 1 ? "" : "s"} across every vendor`;
                return pendingCount > 0 ? `${pendingCount} waiting for review · ${scope}` : scope;
              })()
        }
        actions={
          /* M44 — until now nothing on the platform could list a product
             except a HomeKrafter's own portal, so Homekrafted could not
             sell anything under its own name and an operator could not
             type a kitchen's products up for them. */
          <Button variant="primary" size="sm" onClick={() => router.push("/admin/catalog/new")}>
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            New listing
          </Button>
        }
      />
      <CatalogTabs active="products" pendingSuggestions={pendingSuggestions} />

      {/* Menu items and meal plans awaiting review. They have no tab of
          their own and, until M28, no endpoint that could approve them —
          so a snack sat pending forever while its maker was told it was
          waiting. Renders nothing when the queue is clear. */}
      <ReviewQueuePanel />

      <Toolbar
        search={
          <SearchField
            placeholder="Search by product, vendor or category…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search the catalogue"
          />
        }
      >
        <div className={styles.vendorSelect}>
          <Select
            dense
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
          </Select>
        </div>
        <SegmentedFilter
          label="Filter by status"
          value={statusFilter}
          onChange={(next) => {
            setStatusFilter(next);
            setPage(1);
          }}
          options={STATUS_FILTERS.map((f) =>
            f.value === "pending" ? { ...f, count: pendingCount } : f,
          )}
        />
      </Toolbar>

      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {loadError && <Notice tone="danger">{loadError}</Notice>}

      {!ready || (loading && products.length === 0 && !loadError) ? (
        <LoadingRows rows={5} />
      ) : !loadError && products.length === 0 ? (
        <EmptyState
          title={statusFilter === "pending" ? "Nothing waiting for review." : "No products match these filters."}
          body={
            statusFilter === "pending"
              ? "Every listing has been looked at. New ones land here the moment a HomeKrafter saves one."
              : "Try another status or vendor, or clear the search."
          }
        />
      ) : (
        !loadError && (
          <>
            <div className={styles.list}>
              {products.map((product) => (
                <ProductModerationRow key={product.id} product={product} onAction={handleAction} />
              ))}
            </div>
            <Pager page={page} lastPage={lastPage} onChange={setPage} disabled={loading} />
          </>
        )
      )}
    </div>
  );
}
