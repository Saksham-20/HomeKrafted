import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./Chip.module.css";

export interface ChipProps {
  label: ReactNode;
  /** Pine fill + white text when true; white/bordered when false. */
  selected?: boolean;
  onClick?: () => void;
  /** When provided, renders a trailing "x" affordance (applied-filter tags). */
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Filter chip — ported from the Snacks category filters (idle/selected)
 * and the Shop page's applied-filter tags (selected + removable).
 */
export function Chip({
  label,
  selected = false,
  onClick,
  onRemove,
  disabled = false,
  className,
}: ChipProps) {
  if (onRemove) {
    return (
      <span className={clsx(styles.chip, selected && styles.selected, className)}>
        <button
          type="button"
          className={styles.label}
          onClick={onClick}
          disabled={disabled}
          aria-pressed={selected}
        >
          {label}
        </button>
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove filter"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={clsx(styles.chip, selected && styles.selected, className)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}
