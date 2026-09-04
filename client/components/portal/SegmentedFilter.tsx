"use client";

import clsx from "clsx";
import styles from "./SegmentedFilter.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** How many rows this would show. Printed beside the label when known. */
  count?: number;
}

export interface SegmentedFilterProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** The accessible name of the group — "Filter by status". */
  label: string;
  className?: string;
}

/**
 * A row of mutually exclusive filters that stay on the same page.
 *
 * Replaces the loose `<Chip>` rows the queues used, two of which claimed
 * `role="tablist"` (axe: `aria-required-children`, critical — a tablist
 * may hold only tabs). A group of `aria-pressed` buttons is the honest
 * markup for "narrow this list", and the track makes them read as one
 * control with one answer rather than a wall of unrelated pills. Counts
 * are the point: "Waiting 3" tells an operator there is work before they
 * press anything.
 */
export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedFilterProps<T>) {
  return (
    <div role="group" aria-label={label} className={clsx(styles.group, className)}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            className={clsx(styles.option, on && styles.optionOn)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined && <span className={styles.count}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
