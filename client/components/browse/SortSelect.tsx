"use client";

import { ArrowUpDown } from "lucide-react";
import type { BrowseSortKey } from "@/lib/browse-params";
import styles from "./SortSelect.module.css";

export interface SortSelectProps {
  value: BrowseSortKey;
  onChange: (value: BrowseSortKey) => void;
  /**
   * Whether any loaded listing carries a distance — i.e. whether the
   * buyer's coordinates were sent. "Nearest" is offered only then:
   * offering it to somebody who declined the location prompt is a
   * control that silently does nothing, which is worse than one that is
   * not there. It stays visible while it is the current sort, so a
   * shared `?sort=nearest` URL never renders a select whose value is
   * not among its options.
   */
  hasDistance: boolean;
}

/**
 * The browse sort control, shared by `/shop` and `/gifts` (M56;
 * restyled as a pill in M59). Still a native `<select>` under the
 * pill paint — a custom listbox would re-buy keyboard and screen-reader
 * behaviour the platform already ships.
 */
export function SortSelect({ value, onChange, hasDistance }: SortSelectProps) {
  return (
    <label className={styles.sortRow}>
      <ArrowUpDown size={14} strokeWidth={2} aria-hidden className={styles.sortIcon} />
      <select
        // The wrapping label already names this, but a name computed from
        // a label that contains the control folds the selected option
        // into it — announced as "Sort, Most loved" at best and the whole
        // option list at worst. Stating it once keeps the announced name
        // the same as the visible one.
        aria-label="Sort"
        className={styles.sortSelect}
        value={value}
        onChange={(event) => onChange(event.target.value as BrowseSortKey)}
      >
        <option value="most-loved">Most loved</option>
        {(hasDistance || value === "nearest") && <option value="nearest">Nearest first</option>}
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </select>
    </label>
  );
}
