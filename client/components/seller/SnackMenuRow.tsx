import Link from "next/link";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import { moderationPill } from "@/lib/moderation-copy";
import type { Snack } from "@/lib/types";
import styles from "./SnackMenuRow.module.css";

const CATEGORY_LABEL: Record<Snack["category"], string> = {
  savoury: "Savoury",
  sweet: "Sweet",
  baked: "Baked",
  namkeen: "Namkeen",
};

export interface SnackMenuRowProps {
  snack: Snack;
  onDelete?: (snackId: string) => void;
}

/**
 * One row on `/seller/menu` — thumbnail, name + category/diet, price,
 * availability, review state, edit/delete. Mirrors `ListingRow`'s shape
 * for the maker Listings screen.
 *
 * **Shows both switches, never one merged pill.** `Snack.available` is the
 * kitchen's own "am I making this today"; `moderationStatus` is the
 * admin's "may buyers see it" (M22). Until this row read the second one it
 * showed a snack awaiting approval as a green **AVAILABLE** and nothing
 * else — so a HomeKrafter who had just added their first item was told it
 * was live while no buyer could see it, and had no way to learn otherwise
 * short of opening the editor. Reported from the live site.
 *
 * The two must stay separate for the same reason as `MealPlanRow`: one the
 * kitchen fixes by flipping a switch, the other they cannot fix at all,
 * and merging them leaves somebody toggling a control that changes
 * nothing.
 */
export function SnackMenuRow({ snack, onDelete }: SnackMenuRowProps) {
  const review = moderationPill(snack.moderationStatus);

  return (
    <Card padding="none" className={styles.row}>
      <div className={styles.thumb}>
        <ImageSlot ratio="1/1" label={snack.imagePlaceholder} src={snack.imageSrc} compact />
      </div>
      <div className={styles.body}>
        <span className={styles.name}>{snack.name}</span>
        <span className={styles.meta}>
          {CATEGORY_LABEL[snack.category]} · {snack.diet === "veg" ? "Veg" : "Non-veg"}
        </span>
      </div>
      <span className={styles.price}>{formatCurrency(snack.price)}</span>
      <div className={styles.pills}>
        <span className={clsx(styles.availabilityPill, snack.available ? styles.available : styles.unavailable)}>
          {snack.available ? "Available" : "Unavailable"}
        </span>
        {review && (
          <span
            className={clsx(
              styles.availabilityPill,
              review.tone === "pending" ? styles.pendingReview : styles.blockedReview,
            )}
          >
            {review.label}
          </span>
        )}
      </div>
      {/* The reason, verbatim, next to the edit link that resolves it —
          same rule and same placement as `MealPlanRow`. M22: that sentence
          is the only thing telling them what to change, so it is never
          paraphrased and never shortened into the pill above. */}
      {snack.moderationNote && <span className={styles.moderationNote}>{snack.moderationNote}</span>}

      <div className={styles.actions}>
        <Link
          href={`/seller/menu/${snack.id}`}
          className={styles.iconLink}
          aria-label={`Edit ${snack.name}`}
        >
          <Pencil size={15} strokeWidth={1.7} />
        </Link>
        <button
          type="button"
          className={clsx(styles.iconLink, styles.deleteButton)}
          onClick={() => onDelete?.(snack.id)}
          aria-label={`Delete ${snack.name}`}
        >
          <Trash2 size={15} strokeWidth={1.7} />
        </button>
      </div>
    </Card>
  );
}
