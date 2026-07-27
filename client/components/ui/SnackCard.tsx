import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { DietDot } from "./DietDot";
import { formatCurrency } from "@/lib/format";
import type { Snack } from "@/lib/types";
import styles from "./SnackCard.module.css";

export interface SnackCardProps {
  snack: Snack;
  added?: boolean;
  onAdd?: () => void;
  className?: string;
}

/** Snack card — 1.5:1 image, diet dot, name, desc, price, add/added toggle. */
export function SnackCard({ snack, added = false, onAdd, className }: SnackCardProps) {
  return (
    <div className={clsx(styles.card, className)}>
      <div className={styles.imageWrap}>
        <ImageSlot ratio="1.5/1" label={snack.imagePlaceholder} src={snack.imageSrc} compact />
        <DietDot diet={snack.diet} className={styles.dietDot} />
      </div>
      <div className={styles.content}>
        <span className={styles.name}>{snack.name}</span>
        <span className={styles.desc}>{snack.description}</span>
        <div className={styles.footer}>
          <span className={styles.price}>{formatCurrency(snack.price)}</span>
          <button
            type="button"
            className={clsx(styles.add, added && styles.added)}
            onClick={onAdd}
            aria-pressed={added}
          >
            {added ? "✓ Added" : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
