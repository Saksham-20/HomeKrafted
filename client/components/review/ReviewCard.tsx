import clsx from "clsx";
import { Check, Star } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Review } from "@/lib/types";
import styles from "./ReviewCard.module.css";

export interface ReviewCardProps {
  review: Review;
  className?: string;
}

/**
 * Five-star row — a real `<Star>` icon, filled or outline, gold,
 * decorative. Was the literal `★` glyph until 2026-09-17: a unicode
 * character standing in for an icon renders a different glyph on every
 * OS, which is exactly what the icon-system rule bans. The rating is
 * always also stated in text beside this (`ReviewForm`'s and the
 * product page's summary both do), so `aria-hidden` here loses nothing.
 */
function StarRow({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={15}
          className={index < rating ? styles.starFull : styles.starEmpty}
          fill={index < rating ? "currentColor" : "none"}
        />
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
          <span className={styles.verified}>
            <Check size={11} aria-hidden="true" />
            Verified Buyer
          </span>
        )}
      </div>
      {/* h3, not h4 — `ReviewList` heads the section with an h2, so an h4
          skipped a level and broke the document outline on every product
          page and storefront that shows reviews. */}
      {review.title && <h3 className={styles.title}>{review.title}</h3>}
      <p className={styles.body}>{review.body}</p>
      {review.sellerReply && (
        <div className={styles.sellerReply}>
          <div className={styles.sellerReplyHead}>
            <span className={styles.sellerReplyBadge}>Maker response</span>
            <span className={styles.sellerReplyDate}>{formatDate(review.sellerReply.createdAt)}</span>
          </div>
          <p className={styles.sellerReplyBody}>{review.sellerReply.body}</p>
        </div>
      )}
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
