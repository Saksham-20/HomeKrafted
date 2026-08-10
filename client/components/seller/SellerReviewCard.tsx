"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { formatDate } from "@/lib/format";
import type { Review } from "@/lib/types";
import styles from "./SellerReviewCard.module.css";

function StarRow({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < rating ? styles.starFull : styles.starEmpty}>
          ★
        </span>
      ))}
    </span>
  );
}

export interface SellerReviewCardProps {
  review: Review;
  onReply: (reviewId: string, body: string) => Promise<void>;
}

/**
 * Review card for `/seller/reviews` — same rating/author/body shape
 * `ReviewCard` (consumer) shows, plus a reply affordance: an existing
 * `sellerReply` renders read-only, otherwise a textarea + submit. Kept
 * separate from the consumer `ReviewCard` rather than adding reply props
 * to it, since only the seller surface ever writes a reply.
 */
export function SellerReviewCard({ review, onReply }: SellerReviewCardProps) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!draft.trim()) return;
    setSubmitting(true);
    await onReply(review.id, draft.trim());
    setSubmitting(false);
    setReplying(false);
    setDraft("");
  }

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <StarRow rating={review.rating} />
        <span className={styles.targetTag}>
          {review.targetType === "vendor" ? "Storefront review" : "Product review"}
        </span>
      </div>
      {/* h2 — this list sits directly under the page's h1 ("Reviews") with
          no section heading between, so an h3 skipped a level. Each review
          is a top-level section of this page. */}
      {review.title && <h2 className={styles.title}>{review.title}</h2>}
      <p className={styles.body}>{review.body}</p>
      <div className={styles.meta}>
        <span>{review.userName}</span>
        <span className={styles.dot}>·</span>
        <span>{formatDate(review.createdAt)}</span>
      </div>

      {review.sellerReply ? (
        <div className={styles.reply}>
          <span className={styles.replyLabel}>Your reply</span>
          <p className={styles.replyBody}>{review.sellerReply.body}</p>
        </div>
      ) : replying ? (
        <div className={styles.replyForm}>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Thank the reviewer or address their feedback…"
            rows={3}
          />
          <div className={styles.replyActions}>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting || !draft.trim()}>
              {submitting ? "Posting…" : "Post reply"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setReplying(false)} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost-gold" size="sm" onClick={() => setReplying(true)}>
          Reply
        </Button>
      )}
    </Card>
  );
}
