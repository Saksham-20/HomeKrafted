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
  /** Kept apart, so one failed read does not blank the other half. */
  const [pendingFailed, setPendingFailed] = useState(false);
  const [mineFailed, setMineFailed] = useState(false);
  const [writingFor, setWritingFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped by Try again — the screen offered no in-page path back at all. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /**
     * `allSettled`, not `all`.
     *
     * These are two independent reads answering two halves of one screen,
     * and `Promise.all` threw the successful half away with the failed
     * one — so a 500 on "everything you've written" also hid the list of
     * things waiting to be reviewed, which is the half with an action in
     * it. `failed` is now reserved for both failing; one failing renders
     * its own section empty and says so.
     */
    void Promise.allSettled([getPendingReviews(), getMyReviews()]).then(([pendingRes, mineRes]) => {
      if (cancelled) return;
      setPending(pendingRes.status === "fulfilled" ? pendingRes.value : []);
      setMine(mineRes.status === "fulfilled" ? mineRes.value : []);
      setPendingFailed(pendingRes.status === "rejected");
      setMineFailed(mineRes.status === "rejected");
      setFailed(pendingRes.status === "rejected" && mineRes.status === "rejected");
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

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
        <div className={styles.error} role="alert">
          {/* "Reload the page" is not a thing an app has, and it was the
              only remedy offered — there was no retry control (DS-5).
              It also named the wrong party. */}
          <p>We couldn&apos;t load your reviews. That&apos;s on us, not your connection.</p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              setFailed(false);
              setPending(undefined);
              setReloadToken((token) => token + 1);
            }}
          >
            Try again
          </button>
        </div>
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
                {/* One failed read no longer blanks the other half, so it
                    has to say which half is missing — "nothing waiting"
                    over a list we could not read is the empty state
                    standing in for an error, which is the rule this
                    codebase keeps re-breaking. */}
                {pendingFailed
                  ? "We couldn't load this list just now. Nothing is lost — try again in a moment."
                  : "Nothing waiting. Items show up here once an order containing them is delivered."}
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
              <p className={styles.empty}>
                {mineFailed
                  ? "We couldn't load your written reviews just now. They are safe — try again in a moment."
                  : "You haven't written a review yet."}
              </p>
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
