"use client";

import clsx from "clsx";
import styles from "./QuickFilterChips.module.css";

export interface QuickFilterChip {
  id: string;
  label: string;
  count: number;
  selected: boolean;
  /** Decorative emoji, rendered aria-hidden — see `lib/category-emoji.ts`. */
  icon?: string;
}

export interface QuickFilterChipsProps {
  /** Accessible name for the rail — "Filter by category". */
  label: string;
  chips: QuickFilterChip[];
  onToggle: (id: string) => void;
}

/**
 * One-tap category pills in a horizontal rail over the grid (M59) — the
 * pattern every food-ordering surface has taught this audience. Since
 * M59b it is the primary category control (the sidebar is gone); every
 * shelf renders, zero-count ones dimmed and disabled per the M56 rule.
 * Toggles are the same `toggle()` the sheet's checkboxes call, so the
 * rail and the checklist are one state.
 */
export function QuickFilterChips({ label, chips, onToggle }: QuickFilterChipsProps) {
  if (chips.length < 2) return null;
  // The M56 facet rule, applied to the rail too (owner, 2026-09-02:
  // "north indian categories, add them as well"): a zero-count chip is
  // dimmed and disabled, never hidden — populated ones sort first.
  const ordered = [
    ...chips.filter((chip) => chip.count > 0 || chip.selected),
    ...chips.filter((chip) => chip.count === 0 && !chip.selected),
  ];
  return (
    <div className={clsx(styles.rail, "hk-scroll")} role="group" aria-label={label}>
      {ordered.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={chip.count === 0 && !chip.selected}
          className={clsx(
            styles.chip,
            chip.selected && styles.chipSelected,
            chip.count === 0 && !chip.selected && styles.chipEmpty,
          )}
          aria-pressed={chip.selected}
          onClick={() => onToggle(chip.id)}
        >
          {chip.icon && (
            <span className={styles.chipIcon} aria-hidden>
              {chip.icon}
            </span>
          )}
          {chip.label}
          <span className={styles.chipCount}>{chip.count}</span>
        </button>
      ))}
    </div>
  );
}
