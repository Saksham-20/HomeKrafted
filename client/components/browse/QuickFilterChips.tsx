"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import { categoryTint } from "@/lib/category-tint";
import styles from "./QuickFilterChips.module.css";

export interface QuickFilterChip {
  id: string;
  label: string;
  count: number;
  selected: boolean;
  /**
   * The shelf's icon id (`Category.icon`), drawn by `<Icon>`.
   *
   * Was a decorative emoji keyed on slug until G3. An emoji renders
   * differently on every OS — and the fallback basket was on seventeen
   * chips at once, because a slug→emoji map in code only ever covers the
   * shelves that existed the day somebody wrote it. An admin picks this
   * one, and a shelf minted next week has a mark without a deploy.
   */
  icon?: string | null;
}

export interface QuickFilterChipsProps {
  /** Accessible name for the rail — "Filter by category". */
  label: string;
  chips: QuickFilterChip[];
  onToggle: (id: string) => void;
}

/**
 * One-tap category tiles in a horizontal rail over the grid (M59; icon
 * marks since G3). Since M59b this is the primary category control;
 * every shelf renders, zero-count ones dimmed and disabled per the M56
 * rule. Toggles are the same `toggle()` the sheet's checkboxes call, so
 * the rail and the checklist are one state.
 *
 * **The tint is `lib/category-tint.ts`'s deterministic ground/ink pair
 * (2026-09-17 UI refinement)** — the same mechanism `CategoryTile`
 * already used on the home rail, wired in here too so the shelf reads
 * apart from its neighbours the same way on both surfaces instead of
 * nine identical white tiles in a row.
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
      {ordered.map((chip) => {
        const tint = categoryTint(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            disabled={chip.count === 0 && !chip.selected}
            className={clsx(
              styles.tile,
              chip.selected && styles.tileSelected,
              chip.count === 0 && !chip.selected && styles.tileEmpty,
            )}
            aria-pressed={chip.selected}
            onClick={() => onToggle(chip.id)}
          >
            <span
              className={styles.face}
              aria-hidden="true"
              style={{ "--tile-ground": tint.ground, "--tile-ink": tint.ink } as CSSProperties}
            >
              {/* The mark, never a listing's photograph — see `CategoryTile`. */}
              <span className={styles.faceIcon}>
                <Icon id={chip.icon} size={24} />
              </span>
              <span className={styles.faceCount}>{chip.count}</span>
            </span>
            <span className={styles.tileLabel}>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
