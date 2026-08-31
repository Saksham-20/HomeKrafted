"use client";

import { Chip } from "@/components/ui/Chip";
import styles from "./ActiveFilterBar.module.css";

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface ActiveFilterBarProps {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
}

/**
 * The active filters as removable chips, with one "Clear all" once two
 * or more are stacked (M56). Before this, the only clear-all lived
 * inside the empty state — so it appeared only after the filters had
 * already eaten the grid, which is the one moment it is least useful.
 * A single chip gets no clear-all: its own × is the same tap.
 */
export function ActiveFilterBar({ chips, onClearAll }: ActiveFilterBarProps) {
  return (
    <div className={styles.activeChips}>
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} selected onRemove={chip.onRemove} />
      ))}
      {chips.length >= 2 && (
        <button type="button" className={styles.clearAll} onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  );
}
