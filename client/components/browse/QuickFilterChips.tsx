"use client";

import clsx from "clsx";
import { Check, LayoutGrid } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { categoryTint } from "@/lib/category-tint";
import { radioGroupKeyDown } from "./radio-group-keys";
import { revealChosen } from "./reveal-chosen";
import styles from "./QuickFilterChips.module.css";

export interface QuickFilterChip {
  id: string;
  label: string;
  count: number;
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
  /** Accessible name for the rail — "Category". */
  label: string;
  chips: QuickFilterChip[];
  /** The chosen shelf, or `null` for All. Held by the page, never here. */
  selectedId: string | null;
  /** Choose a shelf — or `null`, from the "All" tile. Replaces the choice; never adds. */
  onSelect: (id: string | null) => void;
  /** Text on the first tile. It is the way out of a shelf, so it always renders. */
  allLabel?: string;
  /** The total behind "All" — omit it and the tile carries no seal. */
  allCount?: number;
}

/**
 * The category rail — one shelf at a time (2026-09-19).
 *
 * **A category is a scope, not a filter.** The rail used to be a row of
 * `aria-pressed` toggles feeding the same `Set` as every checkbox, so a
 * second tap *added* a shelf and "Clear all" wiped it. Amazon's department
 * and Flipkart's category replace: this is a `radiogroup` for that reason,
 * and the first tile is **All**, the only way out short of the empty
 * state's "Show all". Pressing the chosen shelf again does nothing.
 *
 * **Selected is a solid pine face, and it is meant to be loud** (owner:
 * "highlight the selected category better"). It used to be a 2px pine
 * border on a pale tint — the same weight as the hover state, and lost on
 * a rail of eight tinted squares. Now the face fills, the mark and the
 * count seal invert so neither vanishes on it, the label goes bold and
 * underlined, and a small check sits on the corner so the state is not
 * carried by colour alone (WCAG 1.4.1 — pine against six other tints is
 * still just colour to somebody who cannot tell them apart).
 *
 * **No dimmed or disabled empty tiles.** The M56 rule kept zero-count
 * shelves in the row, greyed; the page has filtered them out before this
 * is rendered since M59b, so the branch was dead code carrying a `:disabled`
 * state nobody could reach. A shelf that is selected but empty (a shared
 * link to it) is passed in and stays pressable.
 *
 * **The tint is `lib/category-tint.ts`'s deterministic ground/ink pair**
 * (2026-09-17 UI refinement) — one shelf reads apart from the next.
 */
export function QuickFilterChips({
  label,
  chips,
  selectedId,
  onSelect,
  allLabel = "All",
  allCount,
}: QuickFilterChipsProps) {
  const railRef = useRef<HTMLDivElement>(null);

  // A shared link can select a shelf that sits off the right edge of the
  // rail, where the highlight this component exists to draw is out of
  // sight — `revealChosen` brings it into view (horizontally only).
  useEffect(() => {
    revealChosen(railRef.current, '[aria-checked="true"]');
  }, [selectedId]);

  // Two chips is one shelf and All — a control with nothing to choose.
  if (chips.length < 2) return null;

  const hasChecked = selectedId === null || chips.some((chip) => chip.id === selectedId);

  return (
    <div
      ref={railRef}
      className={clsx(styles.rail, "hk-scroll")}
      role="radiogroup"
      aria-label={label}
      onKeyDown={radioGroupKeyDown}
    >
      <Tile
        label={allLabel}
        count={allCount}
        selected={selectedId === null}
        // Exactly one tab stop: the checked tile, or the first if the
        // selection is somehow not on the rail.
        tabbable={selectedId === null || !hasChecked}
        tint={{ ground: "var(--hk-bg)", ink: "var(--hk-ink-2)" }}
        onSelect={() => onSelect(null)}
      >
        <LayoutGrid size={24} strokeWidth={1.5} aria-hidden="true" />
      </Tile>
      {chips.map((chip) => (
        <Tile
          key={chip.id}
          label={chip.label}
          count={chip.count}
          selected={chip.id === selectedId}
          tabbable={chip.id === selectedId}
          tint={categoryTint(chip.id)}
          onSelect={() => onSelect(chip.id)}
        >
          {/* The mark, never a listing's photograph — see `CategoryTile`. */}
          <Icon id={chip.icon} size={24} />
        </Tile>
      ))}
    </div>
  );
}

function Tile({
  label,
  count,
  selected,
  tabbable,
  tint,
  onSelect,
  children,
}: {
  label: string;
  count?: number;
  selected: boolean;
  tabbable: boolean;
  tint: { ground: string; ink: string };
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      className={clsx(styles.tile, selected && styles.tileSelected)}
      onClick={onSelect}
    >
      <span
        className={styles.face}
        aria-hidden="true"
        style={{ "--tile-ground": tint.ground, "--tile-ink": tint.ink } as CSSProperties}
      >
        <span className={styles.faceIcon}>{children}</span>
        {count !== undefined && <span className={styles.faceCount}>{count}</span>}
        {selected && (
          <span className={styles.faceCheck}>
            <Check size={11} strokeWidth={3.5} />
          </span>
        )}
      </span>
      <span className={styles.tileLabel}>{label}</span>
    </button>
  );
}
