"use client";

import clsx from "clsx";
import styles from "./QuickFilterChips.module.css";

export interface QuickFilterChip {
  id: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface QuickFilterChipsProps {
  /** Accessible name for the rail — "Filter by category". */
  label: string;
  chips: QuickFilterChip[];
  onToggle: (id: string) => void;
}

/**
 * One-tap category pills in a horizontal rail over the grid (M59) — the
 * pattern every food-ordering surface has taught this audience. It
 * exists mainly for the narrow layout, where the checkbox sidebar lives
 * behind a "Filters" button and the most common narrowing (pick one
 * category) used to cost open-sheet → find group → tick → close.
 *
 * Only populated facets get a pill — this rail is a shortcut, not the
 * filter list itself. The sidebar and sheet keep every facet including
 * the dimmed zero-count tail (the M56 rule); nothing here removes a
 * control, it only surfaces the usable subset. Toggles are the same
 * `toggle()` the sidebar's checkboxes call, so the two stay one state.
 */
export function QuickFilterChips({ label, chips, onToggle }: QuickFilterChipsProps) {
  const visible = chips.filter((chip) => chip.count > 0 || chip.selected);
  if (visible.length < 2) return null;
  return (
    <div className={clsx(styles.rail, "hk-scroll")} role="group" aria-label={label}>
      {visible.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={clsx(styles.chip, chip.selected && styles.chipSelected)}
          aria-pressed={chip.selected}
          onClick={() => onToggle(chip.id)}
        >
          {chip.label}
          <span className={styles.chipCount}>{chip.count}</span>
        </button>
      ))}
    </div>
  );
}
