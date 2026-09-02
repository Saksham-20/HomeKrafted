"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import styles from "./FilterPillBar.module.css";

export interface FilterPillDef {
  key: string;
  label: string;
  /** How many of this pill's options are active — badges the pill. */
  activeCount: number;
  /** Popover body — usually a `FilterOptionList`, or a price slider. */
  content: ReactNode;
}

export interface FilterPillBarProps {
  pills: FilterPillDef[];
  /** Total active filters — badges the "All filters" button. */
  allFiltersCount: number;
  /** Opens the full filter sheet. */
  onAllFilters: () => void;
  className?: string;
}

/**
 * The horizontal filter bar (M59b) — the Airbnb-shaped pattern: the two
 * or three most-used facets always visible as dropdown pills, and an
 * "All filters" button opening the full sheet for the rest. This
 * replaced the permanent checkbox sidebar, which read as a settings
 * screen and pushed the catalogue into two thirds of the viewport.
 *
 * Each pill is a popover, not a dialog: it claims no `aria-modal`, so
 * it owes no focus trap (CLAUDE.md's dialog contract is for modality) —
 * it closes on Escape (returning focus to its pill), on an outside
 * pointer press, and when another pill opens. One popover at a time.
 *
 * Filtering applies instantly on tick, same as the sidebar did — the
 * grid is a client-side `useMemo` (M49), so an Apply button would be a
 * delay dressed as a control.
 */
export function FilterPillBar({ pills, allFiltersCount, onAllFilters, className }: FilterPillBarProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (openKey === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenKey(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        buttonRefs.current.get(openKey)?.focus();
        setOpenKey(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openKey]);

  return (
    <div ref={rootRef} className={clsx(styles.bar, className)}>
      {pills.map((pill) => {
        const open = openKey === pill.key;
        return (
          <div key={pill.key} className={styles.pillWrap}>
            <button
              ref={(el) => {
                if (el) buttonRefs.current.set(pill.key, el);
                else buttonRefs.current.delete(pill.key);
              }}
              type="button"
              className={clsx(styles.pill, (open || pill.activeCount > 0) && styles.pillActive)}
              aria-expanded={open}
              onClick={() => setOpenKey(open ? null : pill.key)}
            >
              {pill.label}
              {pill.activeCount > 0 && <span className={styles.badge}>{pill.activeCount}</span>}
              <ChevronDown
                size={14}
                strokeWidth={2}
                aria-hidden
                className={clsx(styles.chevron, open && styles.chevronOpen)}
              />
            </button>
            {open && (
              <div className={styles.panel} role="group" aria-label={pill.label}>
                {pill.content}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className={styles.allBtn} onClick={onAllFilters}>
        <SlidersHorizontal size={15} strokeWidth={2} aria-hidden />
        All filters
        {allFiltersCount > 0 && <span className={styles.badge}>{allFiltersCount}</span>}
      </button>
    </div>
  );
}
