"use client";

import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./QuickFilterChips.module.css";

export interface QuickFilterChip {
  id: string;
  label: string;
  count: number;
  selected: boolean;
  /** Decorative emoji, rendered aria-hidden — see `lib/category-emoji.ts`. */
  icon?: string;
  /** The shelf's photograph (`Category.imageSrc`) — the tile face when present. */
  imageSrc?: string;
}

export interface QuickFilterChipsProps {
  /** Accessible name for the rail — "Filter by category". */
  label: string;
  chips: QuickFilterChip[];
  onToggle: (id: string) => void;
}

/**
 * One-tap category tiles in a horizontal rail over the grid (M59;
 * photo tiles 2026-09-02, owner: "images for categories, text below") —
 * the Swiggy-taught pattern: the shelf's photograph with its name under
 * it. A shelf without a photo shows its emoji on a tinted block, so a
 * rail of mixed shelves stays one shape. Since M59b this is the primary
 * category control; every shelf renders, zero-count ones dimmed and
 * disabled per the M56 rule. Toggles are the same `toggle()` the
 * sheet's checkboxes call, so the rail and the checklist are one state.
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
            styles.tile,
            chip.selected && styles.tileSelected,
            chip.count === 0 && !chip.selected && styles.tileEmpty,
          )}
          aria-pressed={chip.selected}
          onClick={() => onToggle(chip.id)}
        >
          <span className={styles.face} aria-hidden="true">
            {chip.imageSrc ? (
              // alt="" — the tile's visible label is the next node.
              <ImageSlot ratio="4/3" label={chip.label} alt="" src={chip.imageSrc} sizes="72px" compact />
            ) : (
              <span className={styles.faceEmoji}>{chip.icon ?? "🧺"}</span>
            )}
            <span className={styles.faceCount}>{chip.count}</span>
          </span>
          <span className={styles.tileLabel}>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
