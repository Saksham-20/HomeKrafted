import styles from "./Waypoint.module.css";

/**
 * A threshold between two rooms of the page: a hairline with a short
 * label saying what the next room answers. Zero height, so it adds no
 * space and sits over whichever two walls meet there.
 */
export function Waypoint({ label }: { label: string }) {
  return (
    <div className={styles.seam} role="presentation">
      <span className={styles.label}>
        <span className={styles.dot} aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
