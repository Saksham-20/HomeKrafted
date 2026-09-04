import clsx from "clsx";
import styles from "./LoadingRows.module.css";

export interface LoadingRowsProps {
  rows?: number;
  /** Screen-reader announcement. Admin screens say "Loading…"; HomeKrafter screens pass a `kitchenLoading()` line. */
  label?: string;
  /** Show the label visibly too, under the rows. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Skeleton rows for a queue or a list while it loads — the shape of what
 * is coming, in place of the grey "Loading users…" sentence forty-one
 * portal screens used to print. Reserves the height, so the rows do not
 * jump in.
 */
export function LoadingRows({ rows = 4, label = "Loading…", showLabel, className }: LoadingRowsProps) {
  return (
    <div className={clsx(styles.wrap, className)} role="status" aria-live="polite">
      {showLabel ? (
        <p className={styles.label}>{label}</p>
      ) : (
        <span className="hk-sr-only">{label}</span>
      )}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={styles.row} aria-hidden="true">
          <span className={styles.thumb} />
          <span className={styles.lines}>
            <span className={styles.line} />
            <span className={clsx(styles.line, styles.lineShort)} />
          </span>
          <span className={styles.pill} />
        </div>
      ))}
    </div>
  );
}
