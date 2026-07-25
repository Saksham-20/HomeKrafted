import clsx from "clsx";
import styles from "./DietDot.module.css";
import type { DietType } from "@/lib/types";

export interface DietDotProps {
  diet: DietType;
  className?: string;
}

/** Diet indicator — square outline, veg green / non-veg terracotta. */
export function DietDot({ diet, className }: DietDotProps) {
  const isVeg = diet === "veg";
  return (
    <span
      className={clsx(styles.dot, isVeg ? styles.veg : styles.nonVeg, className)}
      role="img"
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
    >
      <span className={styles.glyph} aria-hidden="true" />
    </span>
  );
}
