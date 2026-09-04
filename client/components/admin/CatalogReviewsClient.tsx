"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { AdminReviewRow } from "./AdminReviewRow";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getAllReviewsAdmin,
  moderateReview,
  type AdminReviewSummary,
} from "@/lib/api";
import styles from "./CatalogClient.module.css";

type Filter = "all" | "flagged" | "hidden";

/** `/admin/catalog/reviews` (M11b) — every `Review` (product + vendor), flagged/hidden filters, hide/unhide action. Hiding here filters the review out of `getProductReviews`/`getVendorReviews` going forward (see `Review.hidden`'s doc comment for the client/server caveat). */
export function CatalogReviewsClient() {
  const { ready, role } = useAuth();
  const [reviews, setReviews] = useState<AdminReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const result = await getAllReviewsAdmin(page);
      if (cancelled) return;
      setReviews(result.items);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, page]);

  async function handleToggleHidden(reviewId: string, hidden: boolean) {
    setError(null);
    try {
      const updated = await moderateReview(reviewId, hidden);
      if (!updated) return;
      setReviews((current) => current.map((r) => (r.id === reviewId ? { ...r, hidden } : r)));
    } catch (err) {
      // Hiding a review also recomputes the vendor's rating aggregates
      // (M15). A failure that says nothing leaves a moderator believing a
      // review is gone from the storefront when it is still there.
      setError(apiErrorMessage(err, "Couldn't moderate that review. Try again."));
    }
  }

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (filter === "flagged") return Boolean(r.flagged);
      if (filter === "hidden") return Boolean(r.hidden);
      return true;
    });
  }, [reviews, filter]);

  const flaggedCount = reviews.filter((r) => r.flagged).length;
  const hiddenCount = reviews.filter((r) => r.hidden).length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (!ready || loading) {
    return (
      <div>
        <AdminPageHeader title="Reviews" />
        <CatalogTabs active="reviews" />
        <LoadingRows rows={5} />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Reviews"
        subtitle={`${total} review${total === 1 ? "" : "s"}${
          flaggedCount > 0 ? ` · ${flaggedCount} flagged on this page` : ""
        }`}
      />
      <CatalogTabs active="reviews" />
      {error && <Notice tone="danger">{error}</Notice>}

      <Toolbar>
        {/* The filters narrow the current page of 50; the pager stays so a
            filtered view can reach older pages. */}
        <SegmentedFilter
          label="Filter reviews"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "flagged", label: "Flagged", count: flaggedCount },
            { value: "hidden", label: "Hidden", count: hiddenCount },
          ]}
        />
      </Toolbar>

      {filtered.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No reviews yet." : `No ${filter} reviews on this page.`}
          body={
            filter === "all"
              ? "A review appears here once a buyer writes one against a delivered order."
              : "Try another page, or clear the filter."
          }
        />
      ) : (
        <div className={styles.list}>
          {filtered.map((review) => (
            <AdminReviewRow key={review.id} review={review} onToggleHidden={handleToggleHidden} />
          ))}
        </div>
      )}

      <Pager page={page} lastPage={lastPage} onChange={setPage} />
    </div>
  );
}
