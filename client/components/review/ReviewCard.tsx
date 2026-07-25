import clsx from "clsx";
import { formatDate } from "@/lib/format";
import type { Review } from "@/lib/types";
import styles from "./ReviewCard.module.css";

export interface ReviewCardProps {
  review: Review;
  className?: string;
}

/** Five-star row rendered as filled/outline glyphs — gold, decorative (≥16px equivalent visual weight). */
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

/**
 * Review card — star rating, author + date, verified-purchase badge, title
 * + body. Reused on Product detail (target=product) and Storefront
 * (target=vendor); both consume the same `Review` shape.
 */
export function ReviewCard({ review, className }: ReviewCardProps) {
  return (
    <article className={clsx(styles.card, className)}>
      <div className={styles.head}>
        <StarRow rating={review.rating} />
        {review.verifiedPurchase && (
          <span className={styles.verified}>Verified purchase</span>
        )}
      </div>
      {review.title && <h4 className={styles.title}>{review.title}</h4>}
      <p className={styles.body}>{review.body}</p>
      <div className={styles.meta}>
        <span className={styles.author}>{review.userName}</span>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <span>{formatDate(review.createdAt)}</span>
        {review.helpfulCount > 0 && (
          <>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span>{review.helpfulCount} found this helpful</span>
          </>
        )}
      </div>
    </article>
  );
}
