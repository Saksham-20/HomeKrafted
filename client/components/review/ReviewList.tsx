import clsx from "clsx";
import type { Review } from "@/lib/types";
import { ReviewCard } from "./ReviewCard";
import styles from "./ReviewList.module.css";

export interface ReviewListProps {
  reviews: Review[];
  /** Heading rendered above the list, e.g. "Reviews (128)". Omit to render list only. */
  title?: string;
  emptyLabel?: string;
  className?: string;
}

/** Review list — heading + stacked ReviewCards, or an empty state. Reused on Product detail + Storefront. */
export function ReviewList({
  reviews,
  title,
  emptyLabel = "No reviews yet.",
  className,
}: ReviewListProps) {
  return (
    <div className={clsx(styles.wrap, className)}>
      {title && <h2 className={styles.title}>{title}</h2>}
      {reviews.length === 0 ? (
        <p className={styles.empty}>{emptyLabel}</p>
      ) : (
        <div className={styles.list}>
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
