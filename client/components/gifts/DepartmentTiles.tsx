"use client";

import clsx from "clsx";
import { Icon } from "@/components/ui/Icon";
import type { Department } from "@/lib/api/catalog";
import styles from "./DepartmentTiles.module.css";

export interface DepartmentTilesProps {
  departments: Department[];
  /** The department currently open, by id, or `null`. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** Selected category ids — a department's own id counts (D3). */
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

/**
 * The department row on `/gifts` (G3 §5.1.3).
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
 * **Choosing one discloses its subcategories** rather than navigating. The
 * buyer side reveals progressively the same way the listing form does:
 * nobody is shown "Metal" until they are looking at jewellery, and nobody
 * is shown eleven subcategory chips until they have said which department
 * they are in.
 *
 * The icon is a **corner badge over the photograph**, not the face itself.
 * At 40px a hand-drawn mark is the shopfront when there is nothing else to
 * show; with a real photograph behind it, it is the label on the door.
 */
export function DepartmentTiles({
  departments,
  openId,
  onOpen,
  selectedIds,
  onToggle,
}: DepartmentTilesProps) {
  const open = departments.find((department) => department.id === openId) ?? null;

  return (
    <div className={styles.wrap}>
      <ul className={clsx(styles.tiles, "hk-strip-fade")}>
        {departments.map((department) => {
          /*
            A department with nothing under it filters on press
            (2026-09-16). Pressing a tile only ever revealed a chip row, so
            a childless department — Crochet on production, with one live
            gift and no subcategories — rendered a button that set
            `aria-pressed` and changed nothing on the screen. A control
            that cannot act is the thing this row was rebuilt to remove.

            Selecting the department itself is already a supported answer:
            `expandShelfSelection` matches a parent to its children, so one
            id covers the shelf either way (D3).
          */
          const hasChildren = department.children.length > 0;
          const isOpen = hasChildren && department.id === openId;
          const isSelected = selectedIds.has(department.id);
          return (
            <li key={department.id}>
              <button
                type="button"
                className={clsx(
                  styles.tile,
                  isOpen && styles.tileOpen,
                  isSelected && styles.tileSelected,
                )}
                aria-pressed={hasChildren ? isOpen : isSelected}
                // The count is part of the name a screen reader hears:
                // "Jewellery & Accessories, 24 gifts" is the whole offer,
                // and the visible count is not otherwise associated.
                aria-label={`${department.name}, ${department.count} ${department.count === 1 ? "gift" : "gifts"}`}
                onClick={() =>
                  hasChildren ? onOpen(isOpen ? null : department.id) : onToggle(department.id)
                }
              >
                {/*
                  The department's mark is the face (owner, 2026-09-16).
                  §5.1.3 had a real listing's photograph here, and in the
                  build that was the wrong call for the same reason it is
                  wrong on a category tile: one gift stands in for a whole
                  shelf, it goes stale when that gift sells, and a
                  department whose listings carry no photo fell through to
                  a hatch placeholder beside neighbours that had one.
                */}
                <span className={styles.face} aria-hidden="true">
                  <Icon id={department.icon} size={26} />
                </span>
                <span className={styles.label}>
                  <span className={styles.name}>{department.name}</span>
                  <span className={styles.count} aria-hidden="true">
                    {department.count} {department.count === 1 ? "gift" : "gifts"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open && open.children.length > 0 ? (
        /*
         * The row appears with `@starting-style` (§5.3) — a CSS entry
         * animation with no mount effect and no state to get wrong. It is
         * keyed on the department so switching between two open ones
         * re-runs the entry rather than swapping contents in place.
         */
        <ul className={styles.children} key={open.id} aria-label={`Inside ${open.name}`}>
          {/*
            The department is its own first chip, so a gift filed directly
            on it rather than on one of its subcategories is reachable —
            the D3 rule `FilterGroup` already follows in the filter sheet.
            Without it, opening a department and pressing every chip in the
            row can still miss listings sitting on the parent.
          */}
          <li>
            <button
              type="button"
              className={clsx(styles.chip, selectedIds.has(open.id) && styles.chipOn)}
              aria-pressed={selectedIds.has(open.id)}
              onClick={() => onToggle(open.id)}
            >
              <Icon id={open.icon} size={16} className={styles.chipIcon} />
              <span>All {open.name}</span>
              <span className={styles.chipCount} aria-hidden="true">
                {open.count}
              </span>
            </button>
          </li>
          {open.children.map((child) => {
            const selected = selectedIds.has(child.id);
            return (
              <li key={child.id}>
                <button
                  type="button"
                  className={clsx(styles.chip, selected && styles.chipOn)}
                  aria-pressed={selected}
                  onClick={() => onToggle(child.id)}
                >
                  <Icon id={child.icon} size={16} className={styles.chipIcon} />
                  <span>{child.name}</span>
                  <span className={styles.chipCount} aria-hidden="true">
                    {child.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
