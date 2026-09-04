"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Notice } from "@/components/portal/Notice";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { SellerPageHeader } from "./SellerPageHeader";
import { ListingRow } from "./ListingRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, deleteSellerListing, getCategories, getSellerListings } from "@/lib/api";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import type { Category, Product } from "@/lib/types";
import { moderationPill } from "@/lib/moderation-copy";
import styles from "./ListingsClient.module.css";

type ListingFilter = "all" | "live" | "waiting" | "changes" | "soldout";

/**
 * Which bucket a listing is in, from the two switches that decide whether
 * a buyer can see it (`moderationStatus`, the admin's) and buy it
 * (stock). Pre-M22 rows carry no `moderationStatus` and were live.
 */
function bucketOf(product: Product): Exclude<ListingFilter, "all"> {
  const status = product.moderationStatus ?? "active";
  if (status === "pending") return "waiting";
  if (status === "rejected" || status === "hidden" || status === "flagged") return "changes";
  const stocks = product.weightOptions.map((w) => w.stock);
  if (stocks.length > 0 && Math.min(...stocks) <= 0) return "soldout";
  return "live";
}

/**
 * `/seller/listings` (M10a) — this maker's `Product`s as a list with
 * derived stock status, edit/delete. Create lives at
 * `/seller/listings/new`, edit at `/seller/listings/[id]`.
 *
 * Since 2026-09-04 the list has a search box and a status filter with
 * counts. "Which of my products is a buyer *not* seeing right now" —
 * waiting for review, refused, sold out — was the question a kitchen
 * with twenty listings could not answer without reading every row.
 */
export function ListingsClient() {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // A HomeKrafter without a `vendorId` (a laundry partner, say) has no
    // storefront to list against. That's derivable from `seller` at render
    // time (`noStorefront` below), so this effect just skips — no
    // set-state-in-effect needed to reach the "not set up" card.
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      try {
        const [listings, cats] = await Promise.all([
          getSellerListings(seller.vendorId!),
          getCategories(),
        ]);
        if (cancelled) return;
        setProducts(listings);
        setCategories(cats);
      } catch (error) {
        if (cancelled) return;
        if (isForbidden(error)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty shelf. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered "Nothing listed yet" over three live
        // products — the M37 dashboard rule, on the list (2026-09-04).
        setLoadError(apiErrorMessage(error, "Couldn't load your products. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, reloadToken]);

  /**
   * Two presses, both in our own type: the row's bin icon asks, and the
   * notice under the title does it. A `window.confirm` could not say that
   * the item comes off the shop straight away, and a bare `await` here
   * lost the server's refusal (2026-09-04).
   */
  async function handleDelete(productId: string) {
    if (confirmDeleteId !== productId) {
      setDeleteError(null);
      setConfirmDeleteId(productId);
      return;
    }
    if (!seller?.vendorId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
    await deleteSellerListing(seller.vendorId, productId);
    setProducts((current) => current.filter((p) => p.id !== productId));
      setConfirmDeleteId(null);
    } catch (error) {
      setDeleteError(apiErrorMessage(error, "Couldn't delete that. Try again."));
    } finally {
      setDeleting(false);
    }
  }

  const counts = useMemo(() => {
    const tally = { all: products.length, live: 0, waiting: 0, changes: 0, soldout: 0 };
    for (const product of products) tally[bucketOf(product)] += 1;
    return tally;
  }, [products]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (filter !== "all" && bucketOf(product) !== filter) return false;
      if (!needle) return true;
      const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "";
      return `${product.name} ${categoryName}`.toLowerCase().includes(needle);
    });
  }, [products, categories, query, filter]);

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="Products" />
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
    return <ModuleUnavailable module="Listings" />;
  }

  const header = (
    <SellerPageHeader
      title="Products"
      subtitle={
        loading
          ? undefined
          : `${products.length} product${products.length === 1 ? "" : "s"}${
              counts.waiting > 0 ? ` · ${counts.waiting} waiting for approval` : ""
            }${counts.soldout > 0 ? ` · ${counts.soldout} sold out` : ""}`
      }
      actions={
        <Button variant="primary" size="sm" onClick={() => router.push("/seller/listings/new")}>
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          Add a product
        </Button>
      }
    />
  );

  if (!ready || loading) {
    return (
      <div>
        {header}
        <LoadingRows rows={4} showLabel label={kitchenLoading("seller/listings", MAKER_LOADING)} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          title="Nothing listed yet."
          body="Your first product is four questions away — a photo, what it is, what it costs and a few words. It goes to a quick review, then it is live."
          action={{ href: "/seller/listings/new", label: "Add your first product" }}
        />
      </div>
    );
  }

  const deleteTarget = confirmDeleteId ? products.find((item) => item.id === confirmDeleteId) : undefined;

  return (
    <div>
      {header}
      {deleteTarget && (
        <Notice
          tone="warning"
          title={`Delete “${deleteTarget.name}”?`}
          actions={
            <>
              <Button size="sm" onClick={() => handleDelete(deleteTarget.id)} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
                Keep it
              </Button>
            </>
          }
        >
          It comes off the shop straight away and cannot be undone.
          {deleteError && <p role="alert">{deleteError}</p>}
        </Notice>
      )}

      <Toolbar
        search={
          <SearchField
            placeholder="Search your products…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search your products"
          />
        }
      >
        <SegmentedFilter
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "live", label: "Live", count: counts.live },
            // The pill's own words, so the filter and the row cannot drift apart.
            { value: "waiting", label: moderationPill("pending")!.label, count: counts.waiting },
            { value: "changes", label: "Needs changes", count: counts.changes },
            { value: "soldout", label: "Sold out", count: counts.soldout },
          ]}
        />
      </Toolbar>

      {visible.length === 0 ? (
        <EmptyState
          title={query ? "Nothing matches that." : "Nothing in this group."}
          body={
            query
              ? "Try a shorter word, or clear the search."
              : "Every product is somewhere else in the list — pick another filter."
          }
        />
      ) : (
        <div className={styles.list}>
          {visible.map((product) => (
            <ListingRow
              key={product.id}
              product={product}
              categoryName={categories.find((c) => c.id === product.categoryId)?.name}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
