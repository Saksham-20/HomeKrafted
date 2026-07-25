import clsx from "clsx";
import styles from "./StatusTimeline.module.css";

export interface StatusTimelineStep {
  label: string;
  done: boolean;
  /** In-progress emphasis on a not-yet-done step (small extension beyond the ported prototype). */
  current?: boolean;
}

export interface StatusTimelineProps {
  steps: StatusTimelineStep[];
  /**
   * "whatsapp" ports the exact WhatsApp-status green dots — reserve for
   * the Snacks WA timeline only (per lib/channel.ts / the "WhatsApp green
   * is reserved for that channel" rule). "pine" is the default for the
   * general order-status reuse this component is meant for.
   */
  tone?: "pine" | "whatsapp";
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/**
 * Status timeline — dots (filled = done), ported from the Snacks
 * "Order updates on WhatsApp" panel (Received → Accepted → Out for
 * delivery). Reused for general order/booking status with `tone="pine"`.
 */
export function StatusTimeline({
  steps,
  tone = "pine",
  orientation = "vertical",
  className,
}: StatusTimelineProps) {
  return (
    <div
      className={clsx(styles.timeline, styles[orientation], styles[tone], className)}
      role="list"
    >
      {steps.map((step, index) => (
        <div key={index} role="listitem" className={styles.step}>
          <span
            className={clsx(
              styles.dot,
              step.done && styles.done,
              step.current && styles.current,
            )}
            aria-hidden="true"
          />
          <span
            className={clsx(
              styles.label,
              (step.done || step.current) && styles.labelActive,
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
