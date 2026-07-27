"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SellerPageHeader } from "./SellerPageHeader";
import { SellerReviewCard } from "./SellerReviewCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerReviews, replySellerReview } from "@/lib/api";
import type { Review } from "@/lib/types";
import styles from "./SellerReviewsClient.module.css";

/** `/seller/reviews` (M10a) — reviews on this maker's products + vendor storefront, newest first, with a mock reply. */
export function SellerReviewsClient() {
  const { ready, seller } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seller?.vendorId) return;
    const list = await getSellerReviews(seller.vendorId);
    setReviews(list);
    setLoading(false);
  }, [seller]);

  useEffect(() => {
    if (!ready || !seller?.vendorId) return;
    (async () => {
      await load();
    })();
  }, [ready, seller, load]);

  async function handleReply(reviewId: string, body: string) {
    await replySellerReview(reviewId, body);
    await load();
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
        <Card className={styles.empty}>No reviews yet.</Card>
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
