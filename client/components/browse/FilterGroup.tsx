"use client";

import clsx from "clsx";
import styles from "./FilterGroup.module.css";

export interface FilterOption {
  id: string;
  label: string;
  /** How many of the currently loaded listings carry this facet. */
  count: number;
  checked: boolean;
}

export interface FilterGroupProps {
  title: string;
  options: FilterOption[];
  onToggle: (id: string) => void;
}

/**
 * One facet of a browse sidebar: a mono heading over checkbox rows with
 * per-option counts (M56 — extracted from `ShopClient`, unchanged, so
 * `/shop` and `/gifts` render the same control).
 *
 * A zero-count option is dimmed and disabled, never hidden: a count of
 * zero is information ("we have no bakery near you today"), and a facet
 * that vanishes and reappears as stock changes is a filter list nobody
 * can learn. A *checked* option is never disabled, even at zero, or the
 * filter that emptied the grid could not be switched off.
 */
export function FilterGroup({ title, options, onToggle }: FilterGroupProps) {
  return (
    <div className={styles.filterGroup}>
      <div className={styles.filterTitle}>{title}</div>
      {options.map((option) => (
        <label
          key={option.id}
          className={clsx(
            styles.checkboxRow,
            option.count === 0 && !option.checked && styles.checkboxRowEmpty,
          )}
        >
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={option.checked}
            disabled={option.count === 0 && !option.checked}
            onChange={() => onToggle(option.id)}
          />
          {option.label}
          <span className={styles.count}>{option.count}</span>
        </label>
      ))}
    </div>
  );
}
