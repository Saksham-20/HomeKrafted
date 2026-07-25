import clsx from "clsx";
import type { Occasion } from "@/lib/types";
import styles from "./OccasionTile.module.css";

export interface OccasionTileProps {
  occasion: Occasion;
  onClick?: () => void;
  className?: string;
}

/** Occasion tile — initial in a gold ring + label, no image, ported from "Shop by occasion". */
export function OccasionTile({ occasion, onClick, className }: OccasionTileProps) {
  return (
    <button
      type="button"
      className={clsx(styles.tile, className)}
      onClick={onClick}
    >
      <span className={styles.ring} aria-hidden="true">
        {occasion.initial}
      </span>
      <span className={styles.label}>{occasion.name}</span>
    </button>
  );
}
