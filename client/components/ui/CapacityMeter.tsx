import clsx from "clsx";
import styles from "./CapacityMeter.module.css";

export interface CapacityMeterProps {
  current: number;
  max: number;
  /** Overrides the default "current / max" fraction text. */
  label?: string;
  title?: string;
  className?: string;
}

/** Capacity meter — gold-gradient fill with "n/max", ported from the Hamper basket. */
export function CapacityMeter({
  current,
  max,
  label,
  title,
  className,
}: CapacityMeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;

  return (
    <div className={clsx(styles.meter, className)}>
      <div className={styles.header}>
        {title && <span className={styles.title}>{title}</span>}
        <span className={styles.fraction}>{label ?? `${current} / ${max}`}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
