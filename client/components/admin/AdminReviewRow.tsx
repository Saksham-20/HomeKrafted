import clsx from "clsx";
import { Flag } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import type { AdminReviewSummary } from "@/lib/api";
import styles from "./AdminReviewRow.module.css";

export interface AdminReviewRowProps {
  review: AdminReviewSummary;
  onToggleHidden: (reviewId: string, hidden: boolean) => void;
}

/** `/admin/catalog/reviews` row — rating, title/body excerpt, target (product/vendor name), flagged badge, hide/unhide action. */
export function AdminReviewRow({ review, onToggleHidden }: AdminReviewRowProps) {
  const hidden = review.hidden ?? false;

  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.body}>
        <div className={styles.headRow}>
          <span className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>
            {"★".repeat(review.rating)}
            {"☆".repeat(5 - review.rating)}
          </span>
          {review.flagged && (
            <span className={styles.flaggedBadge}>
              <Flag size={11} strokeWidth={2} aria-hidden="true" />
              Reported
            </span>
          )}
          <StatusPill status={hidden ? "hidden" : "visible"} label={hidden ? "Hidden" : "Visible"} />
        </div>
        {review.title && <span className={styles.title}>{review.title}</span>}
        <p className={clsx(styles.excerpt, hidden && styles.excerptHidden)}>{review.body}</p>
        <span className={styles.meta}>
          {review.targetType === "product" ? "Product" : review.targetType === "vendor" ? "Vendor" : "Service"}:{" "}
          {review.targetName} · {review.userName} · {formatDate(review.createdAt)}
        </span>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={() => onToggleHidden(review.id, !hidden)}>
          {hidden ? "Unhide" : "Hide"}
        </Button>
      </div>
    </Card>
  );
}
