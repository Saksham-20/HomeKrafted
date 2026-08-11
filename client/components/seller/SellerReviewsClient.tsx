"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { SellerPageHeader } from "./SellerPageHeader";
import { SellerReviewCard } from "./SellerReviewCard";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerReviews, replySellerReview } from "@/lib/api";
import type { Review } from "@/lib/types";
import styles from "./SellerReviewsClient.module.css";

/** `/seller/reviews` (M10a) — reviews on this maker's products + vendor storefront, newest first, with a mock reply. */
export function SellerReviewsClient() {
  const { ready, seller, sellerDataReady } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (!seller?.vendorId) return;
    try {
      const list = await getSellerReviews(seller?.vendorId ?? "");
      setReviews(list);
    } catch (error) {
      if (!isForbidden(error)) throw error;
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [seller]);

  useEffect(() => {
    // Reviews hang off a vendor storefront — a HomeKrafter without one
    // has no reviews module, and the nav now surfaces it to everyone.
    // Derived at render time (`noStorefront`), so this effect just skips.
    if (!sellerDataReady) return;
    (async () => {
      await load();
    })();
  }, [sellerDataReady, seller, load]);

  async function handleReply(reviewId: string, body: string) {
    await replySellerReview(reviewId, body);
    await load();
  }

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (noStorefront || unavailable) {
    return <ModuleUnavailable module="Reviews" />;
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading reviews…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title="Reviews"
        subtitle={`${reviews.length} review${reviews.length === 1 ? "" : "s"} on your products and storefront`}
      />

      {reviews.length === 0 ? (
        <EmptyState
          title="No reviews yet."
          body="A review can only be left by someone whose order was delivered, so the first one arrives after your first completed order. They show on your storefront as they come in."
          action={{ href: "/seller/orders", label: "Your orders" }}
        />
      ) : (
        <div className={styles.list}>
          {reviews.map((review) => (
            <SellerReviewCard key={review.id} review={review} onReply={handleReply} />
          ))}
        </div>
      )}
    </div>
  );
}
