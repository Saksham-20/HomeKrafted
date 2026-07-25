import clsx from "clsx";
import styles from "./StepPills.module.css";

export interface StepPillsStep {
  n: number | string;
  label: string;
}

export interface StepPillsProps {
  steps: StepPillsStep[];
  activeIndex: number;
  className?: string;
}

/** Step pills — ported from the Hamper builder (Box/Fill/Message/Checkout); active = pine fill. */
export function StepPills({ steps, activeIndex, className }: StepPillsProps) {
  return (
    <div className={clsx(styles.row, className)} role="list">
      {steps.map((step, index) => (
        <span
          key={index}
          role="listitem"
          className={clsx(styles.pill, index === activeIndex && styles.active)}
          aria-current={index === activeIndex ? "step" : undefined}
        >
          {step.n} {step.label}
        </span>
      ))}
    </div>
  );
}
