"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Button } from "@/components/ui/Button";
import { ReviewCard } from "@/components/review/ReviewCard";
import { ReviewForm } from "@/components/review/ReviewForm";
import { getMyReviews, getPendingReviews, type PendingReview } from "@/lib/api";
import type { Review } from "@/lib/types";
import styles from "./MyReviewsClient.module.css";

/**
 * `/account/reviews` — the buyer's side of the review loop.
 *
 * Two lists, and the order matters: **waiting for your review** first
 * (delivered items the buyer hasn't rated), then what they've already
 * written. Before M15 neither existed and there was no prompt to review
 * anywhere in the product, which is most of why every rating on the site
 * was seed data.
 *
 * Fetches on mount rather than server-side: both reads are owner-scoped
 * (`/reviews/mine`, `/reviews/mine/pending`), the same reason every other
 * authed account screen in this app is a client component.
 */
export function MyReviewsClient() {
  const [pending, setPending] = useState<PendingReview[] | undefined>(undefined);
  const [mine, setMine] = useState<Review[]>([]);
  const [writingFor, setWritingFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPendingReviews(), getMyReviews()])
      .then(([pendingRows, mineRows]) => {
        if (cancelled) return;
        setPending(pendingRows);
        setMine(mineRows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmitted(review: Review, target: PendingReview) {
    setMine((current) => [review, ...current]);
    setPending((current) => current?.filter((row) => row.targetId !== target.targetId));
    setWritingFor(null);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Reviews</h1>
        <p className={styles.subtitle}>
          Rate what you&apos;ve received, and see everything you&apos;ve written.
        </p>
      </div>

      {failed ? (
        <p className={styles.error} role="alert">
          Couldn&apos;t load your reviews. Reload the page to try again.
        </p>
      ) : pending === undefined ? (
        <p className={styles.loading}>Loading your reviews…</p>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Waiting for your review{" "}
              <span className={styles.count}>{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
              <p className={styles.empty}>
                Nothing waiting. Items show up here once an order containing them is
                delivered.
              </p>
            ) : (
              <ul className={styles.pendingList}>
                {pending.map((item) => (
                  <li key={item.targetId} className={styles.pendingItem}>
                    <div className={styles.pendingRow}>
                      <span className={styles.thumb}>
                        <ImageSlot
                          ratio="1/1"
                          shape="square"
                          label={item.imagePlaceholder}
                          src={item.imageSrc}
                          alt={item.name}
                          sizes="64px"
                          compact
                        />
                      </span>
                      <span className={styles.pendingText}>
                        <Link href={`/product/${item.slug}`} className={styles.pendingName}>
                          {item.name}
                        </Link>
                        <span className={styles.pendingMaker}>{item.vendorName}</span>
                      </span>
                      {writingFor === item.targetId ? null : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setWritingFor(item.targetId)}
                        >
                          Write a review
                        </Button>
                      )}
                    </div>
                    {writingFor === item.targetId && (
                      <ReviewForm
                        className={styles.form}
                        targetType={item.targetType}
                        targetId={item.targetId}
                        targetName={item.name}
                        onSubmitted={(review) => handleSubmitted(review, item)}
                        onCancel={() => setWritingFor(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Written by you <span className={styles.count}>{mine.length}</span>
            </h2>
            {mine.length === 0 ? (
              <p className={styles.empty}>You haven&apos;t written a review yet.</p>
            ) : (
              <div className={styles.mineList}>
                {mine.map((review) => (
                  <div key={review.id} className={styles.mineItem}>
                    <ReviewCard review={review} />
                    {/* A moderated review stays visible to its author —
                        "why did mine disappear" needs an answer somewhere. */}
                    {review.hidden && (
                      <p className={styles.hiddenNote}>
                        Hidden by a moderator — only you can see this one.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
