import Link from "next/link";
import clsx from "clsx";
import { Pencil, PowerOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import type { SellerMealPlan } from "@/lib/types";
import styles from "./MealPlanRow.module.css";

export interface MealPlanRowProps {
  plan: SellerMealPlan;
  onClose?: (planId: string) => void;
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
export function MealPlanRow({ plan, onClose }: MealPlanRowProps) {
  const hidden = plan.moderationStatus !== "active";
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
        {hidden && (
          <span className={clsx(styles.pill, styles.hidden)}>
            {plan.moderationStatus === "flagged" ? "Flagged" : "Hidden by us"}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <Link
          href={`/seller/meal-plans/${plan.id}`}
          className={styles.iconLink}
          aria-label={`Edit ${plan.name}`}
        >
          <Pencil size={15} strokeWidth={1.7} />
        </Link>
        {plan.isActive && (
          <button
            type="button"
            className={clsx(styles.iconLink, styles.closeButton)}
            onClick={() => onClose?.(plan.id)}
            aria-label={`Stop taking new subscribers for ${plan.name}`}
          >
            <PowerOff size={15} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </Card>
  );
}
