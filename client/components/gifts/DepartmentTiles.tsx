"use client";

import clsx from "clsx";
import { Check, LayoutGrid } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { radioGroupKeyDown } from "@/components/browse/radio-group-keys";
import { revealChosen } from "@/components/browse/reveal-chosen";
import { Icon } from "@/components/ui/Icon";
import { categoryTint } from "@/lib/category-tint";
import type { Department } from "@/lib/api/catalog";
import styles from "./DepartmentTiles.module.css";

export interface DepartmentTilesProps {
  departments: readonly Department[];
  /**
   * The chosen shelf — a department, one of its subcategories, or `null`
   * for All. Held by the page (`useBrowseFilters#category`); this never
   * keeps a second copy.
   */
  selectedId: string | null;
  /** Choose a shelf, or `null` from the "All" tile. Replaces the choice; never adds. */
  onSelect: (id: string | null) => void;
  /**
   * How many gifts are behind the "All gifts" tile — the catalogue as
   * listed. **Omit it and the tile states no number.** Every count on the
   * departments is a server-side total over the whole live catalogue, so a
   * page that has narrowed its own list (the finder's recipient reloads it
   * server-side) must not print that narrowed length here: "All gifts, 12"
   * beside "Jewellery, 24" is a child larger than its whole.
   */
  allCount?: number;
}

/**
 * The department row on `/gifts` (G3 §5.1.3) — one shelf at a time
 * (2026-09-19).
 *
 * **A category is a scope, not a filter.** Pressing a department *selects*
 * it (its own listings and every subcategory's — `expandShelfSelection`),
 * and that is also what reveals its subcategory chips: the open row is
 * **derived from the selection**, not a second piece of state. Two things
 * follow. Pressing a subcategory chip *replaces* the department selection
 * rather than adding to it, and a shared `/gifts?category=earrings` link
 * opens with Jewellery highlighted and its chips out — it used to open with
 * no department expanded and nothing visibly chosen, because "open" lived
 * in React and the URL only carried what was selected.
 *
 * The first tile is **All gifts**, the way out. Pressing the chosen tile
 * again does nothing.
 *
 * **Three tile states, not two.** *Selected* is the solid pine treatment
 * the category rail on `/shop` uses (`QuickFilterChips`), so the two pages
 * read the same. *Ancestor* is the department whose subcategory is chosen —
 * lighter (pine border and tint, no fill), because the shelf actually being
 * browsed is the chip below and the tile only says "you are inside this
 * one". It is `aria-current`, not `aria-checked`: a radio cannot be half
 * checked.
 *
 * **The face is the department's own mark, not a photograph** (owner,
 * 2026-09-16, reversing §5.1.3). A listing's photo standing in for a whole
 * shelf goes stale the moment that listing sells, and a department whose
 * gifts carry no picture fell through to a labelled hatch beside
 * neighbours that had one — so the row read as half-built. The mark is
 * picked by an admin from the icon registry and is the same vocabulary the
 * chips and the category tiles draw.
 *
 * **Only departments with something live are here** (D2, owner). The tiles
 * this replaces were emoji on a tint, and 18 of the 26 were dimmed and
 * disabled — so most of the control was dead controls. An empty shelf is
 * not rendered rather than rendered unpressable.
 *
 * The buyer side reveals progressively the same way the listing form does:
 * nobody is shown "Metal" until they are looking at jewellery, and nobody
 * is shown eleven subcategory chips until they have said which department
 * they are in.
 */
export function DepartmentTiles({ departments, selectedId, onSelect, allCount }: DepartmentTilesProps) {
  const tilesRef = useRef<HTMLDivElement>(null);

  // Under 640px the strip is a horizontal scroller, and a shared link can
  // choose a department past the fifth tile — where the solid highlight is
  // out of sight and, with All unchecked, the row reads as nothing chosen.
  // Bring the chosen tile (or, for a subcategory, the department it is
  // inside — `aria-current`) into view, as `QuickFilterChips` does for /shop.
  useEffect(() => {
    revealChosen(tilesRef.current, '[aria-checked="true"], [aria-current="true"]');
  }, [selectedId]);

  // "All gifts" beside nothing is a control with nothing to choose between.
  if (departments.length === 0) return null;

  /*
    The department whose row is showing: the selection itself, or the parent
    of the selected subcategory. Derived on every render — there is no
    "opened but not chosen" state any more.
  */
  const open =
    selectedId === null
      ? null
      : (departments.find(
          (department) =>
            department.id === selectedId ||
            department.children.some((child) => child.id === selectedId),
        ) ?? null);

  const allSelected = selectedId === null;
  // One tab stop for the whole group: the chosen tile, else the department
  // the chosen chip lives under, else All.
  const tabStopId = open?.id ?? null;

  return (
    <div className={styles.wrap}>
      <div
        ref={tilesRef}
        className={clsx(styles.tiles, "hk-strip-fade")}
        role="radiogroup"
        aria-label="Category"
        onKeyDown={radioGroupKeyDown}
      >
        <button
          type="button"
          role="radio"
          aria-checked={allSelected}
          tabIndex={tabStopId === null ? 0 : -1}
          className={clsx(styles.tile, allSelected && styles.tileSelected)}
          aria-label={
            allCount === undefined
              ? "All gifts"
              : `All gifts, ${allCount} ${allCount === 1 ? "gift" : "gifts"}`
          }
          onClick={() => onSelect(null)}
        >
          <span
            className={styles.face}
            aria-hidden="true"
            style={
              { "--tile-ground": "var(--hk-bg)", "--tile-ink": "var(--hk-ink-2)" } as CSSProperties
            }
          >
            <LayoutGrid size={24} strokeWidth={1.5} />
            {allSelected && <CheckBadge />}
          </span>
          <span className={styles.label}>
            <span className={styles.name}>All gifts</span>
            {allCount !== undefined && (
              <span className={styles.count} aria-hidden="true">
                {allCount} {allCount === 1 ? "gift" : "gifts"}
              </span>
            )}
          </span>
        </button>

        {departments.map((department) => {
          const isSelected = department.id === selectedId;
          // The chosen subcategory is inside this department. Only ever
          // true for the one `open` names, and never alongside `isSelected`.
          const isAncestor = !isSelected && open?.id === department.id;
          const tint = categoryTint(department.id);
          return (
            <button
              key={department.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-current={isAncestor ? "true" : undefined}
              tabIndex={tabStopId === department.id ? 0 : -1}
              className={clsx(
                styles.tile,
                isSelected && styles.tileSelected,
                isAncestor && styles.tileAncestor,
              )}
              // The count is part of the name a screen reader hears:
              // "Jewellery & Accessories, 24 gifts" is the whole offer,
              // and the visible count is not otherwise associated.
              aria-label={`${department.name}, ${department.count} ${department.count === 1 ? "gift" : "gifts"}`}
              onClick={() => onSelect(department.id)}
            >
              {/*
                The tint is `lib/category-tint.ts`'s deterministic
                ground/ink pair (2026-09-17) — the same mechanism
                `CategoryTile` and `QuickFilterChips` use, so nine
                departments read apart from each other instead of nine
                identical pine-tint squares. `.tileSelected` overrides it
                with pine on purpose: a chosen department is answering
                "which one", not "what colour".
              */}
              <span
                className={styles.face}
                aria-hidden="true"
                style={{ "--tile-ground": tint.ground, "--tile-ink": tint.ink } as CSSProperties}
              >
                <Icon id={department.icon} size={24} />
                {isSelected && <CheckBadge />}
                {isAncestor && <span className={styles.insideDot} />}
              </span>
              <span className={styles.label}>
                <span className={styles.name}>{department.name}</span>
                <span className={styles.count} aria-hidden="true">
                  {department.count} {department.count === 1 ? "gift" : "gifts"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {open && open.children.length > 0 ? (
        /*
         * The row appears with `@starting-style` (§5.3) — a CSS entry
         * animation with no mount effect and no state to get wrong. It is
         * keyed on the department so switching between two departments
         * re-runs the entry rather than swapping contents in place.
         */
        <div
          className={styles.children}
          key={open.id}
          role="radiogroup"
          aria-label={`Inside ${open.name}`}
          onKeyDown={radioGroupKeyDown}
        >
          {/*
            The department is its own first chip, so a gift filed directly
            on it rather than on one of its subcategories is reachable —
            the D3 rule. It is also *the department selection*: pressing it
            from a subcategory steps back up to the whole department.
          */}
          <ChildChip
            label={`All ${open.name}`}
            icon={open.icon}
            count={open.count}
            selected={selectedId === open.id}
            onSelect={() => onSelect(open.id)}
          />
          {open.children.map((child) => (
            <ChildChip
              key={child.id}
              label={child.name}
              icon={child.icon}
              count={child.count}
              selected={selectedId === child.id}
              onSelect={() => onSelect(child.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* On the mark's corner, inside its `aria-hidden` face — `aria-checked` is what says it. */
function CheckBadge() {
  return (
    <span className={styles.check}>
      <Check size={10} strokeWidth={3.5} />
    </span>
  );
}

function ChildChip({
  label,
  icon,
  count,
  selected,
  onSelect,
}: {
  label: string;
  icon: string | null;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      className={clsx(styles.chip, selected && styles.chipOn)}
      onClick={onSelect}
    >
      {/* The check takes the mark's slot, so the chip does not change width when chosen. */}
      {selected ? (
        <Check size={16} strokeWidth={3} className={styles.chipIcon} aria-hidden="true" />
      ) : (
        <Icon id={icon} size={16} className={styles.chipIcon} />
      )}
      <span>{label}</span>
      <span className={styles.chipCount} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
