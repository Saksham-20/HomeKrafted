import Link from "next/link";
import clsx from "clsx";
import { Pencil, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import { moderationPill } from "@/lib/moderation-copy";
import type { SellerMealPlan } from "@/lib/types";
import styles from "./MealPlanRow.module.css";

export interface MealPlanRowProps {
  plan: SellerMealPlan;
  /** Whether the inline "stop taking subscribers" confirmation is open for this row. */
  confirmingClose?: boolean;
  onRequestClose?: () => void;
  onConfirmClose?: () => void;
  onCancelClose?: () => void;
}

/**
 * One row on `/seller/meal-plans`.
 *
 * Shows **both** switches rather than one merged "available" pill. A cook
 * who has paused their own plan and a plan an admin has hidden are entirely
 * different situations — the first they fix themselves, the second they
 * have to ask about — and collapsing them would leave someone toggling a
 * switch that changes nothing.
 */
export function MealPlanRow({
  plan,
  confirmingClose,
  onRequestClose,
  onConfirmClose,
  onCancelClose,
}: MealPlanRowProps) {
  const review = moderationPill(plan.moderationStatus);
  // `maxSubscribers` absent means the kitchen set no ceiling. "0 seats left"
  // would close a plan that is open, so uncapped says so in words.
  const capacity = plan.maxSubscribers
    ? `${plan.subscriberCount}/${plan.maxSubscribers} subscribers`
    : `${plan.subscriberCount} subscriber${plan.subscriberCount === 1 ? "" : "s"} · no limit set`;

  return (
    <Card padding="none" className={styles.row}>
      <div className={styles.thumb}>
        <ImageSlot
          ratio="1/1"
          label={plan.imagePlaceholder}
          alt={plan.name}
          src={plan.imageSrc}
          sizes="64px"
          compact
        />
      </div>

      <div className={styles.body}>
        <span className={styles.name}>{plan.name}</span>
        <span className={styles.meta}>
          {plan.slotName} · {plan.diet === "veg" ? "Veg" : "Non-veg"} · {capacity}
        </span>
      </div>

      <span className={styles.price}>
        {formatCurrency(plan.pricePerMeal)}
        <span className={styles.unit}>{plan.mealType ? "/meal" : "/delivery"}</span>
      </span>

      <div className={styles.pills}>
        <span className={clsx(styles.pill, plan.isActive ? styles.live : styles.paused)}>
          {plan.isActive ? "Taking subscribers" : "Closed"}
        </span>
        {/* `moderationPill` rather than a map local to this file: the same
            four states appear on /seller/listings and /seller/menu, and
            three private copies is how "Waiting for review" and "Waiting
            for approval" came to mean the same thing. It also splits
            pending from the rest by tone — "we have not looked yet" is not
            "we looked and you must change something", and colouring them
            alike tells a kitchen off for listing a plan. */}
        {review && (
          <span
            className={clsx(styles.pill, review.tone === "pending" ? styles.pendingReview : styles.hidden)}
          >
            {review.label}
          </span>
        )}
      </div>
      {/* The reason, verbatim, next to the edit link that resolves it.
          M22 — before this a plan could be refused and the kitchen was
          told neither that it happened nor why. */}
      {plan.moderationNote && <span className={styles.moderationNote}>{plan.moderationNote}</span>}

      {confirmingClose && (
        <div className={styles.confirmClose} role="group" aria-label={`Stop taking new subscribers for ${plan.name}?`}>
          <p className={styles.confirmCloseText}>
            Stop taking new subscribers for &ldquo;{plan.name}&rdquo;?{" "}
            {plan.subscriberCount > 0
              ? `The ${plan.subscriberCount} ${plan.subscriberCount === 1 ? "person" : "people"} already on it keep their meals — they've paid for those, and you still need to cook them. You can reopen the plan any time.`
              : "You can reopen it any time."}
          </p>
          <div className={styles.confirmCloseActions}>
            <Button size="sm" variant="secondary" onClick={onConfirmClose}>
              Stop taking subscribers
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancelClose}>
              Never mind
            </Button>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <Link
          href={`/seller/meal-plans/${plan.id}`}
          className={styles.iconLink}
          aria-label={`Edit ${plan.name}`}
        >
          <Pencil size={15} strokeWidth={1.7} />
        </Link>
        {plan.isActive && !confirmingClose && (
          <button
            type="button"
            className={clsx(styles.iconLink, styles.closeButton)}
            onClick={onRequestClose}
            aria-label={`Stop taking new subscribers for ${plan.name}`}
          >
            <PowerOff size={15} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </Card>
  );
}
