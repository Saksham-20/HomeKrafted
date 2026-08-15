"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
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

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All reviews" },
  { value: "flagged", label: "Flagged" },
  { value: "hidden", label: "Hidden" },
];

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

  if (!ready || loading) {
    return <div className={styles.loading}>Loading reviews…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Reviews"
        subtitle={`${total} review${total === 1 ? "" : "s"} · ${flaggedCount} flagged on this page`}
      />
      <CatalogTabs active="reviews" />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.filters}>
        <div className={styles.chipRow} role="tablist" aria-label="Filter reviews">
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={filter === f.value} onClick={() => setFilter(f.value)} />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className={styles.empty}>No reviews match this filter.</Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((review) => (
            <AdminReviewRow key={review.id} review={review} onToggleHidden={handleToggleHidden} />
          ))}
        </div>
      )}

      {/* The flagged/hidden chips narrow the current page of 50; the
          pager stays visible so a filtered view can reach older pages. */}
      {total > pageSize && (
        <div className={styles.pager}>
          <Chip
            label="Previous"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            selected={false}
          />
          <span className={styles.pagerLabel} aria-live="polite">
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Chip
            label="Next"
            onClick={() => setPage((current) => Math.min(Math.ceil(total / pageSize), current + 1))}
            selected={false}
          />
        </div>
      )}
    </div>
  );
}
