"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { FOCUSABLE, trapTab } from "@/lib/focus-trap";
import styles from "./MobileFilterSheet.module.css";

export interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** Live match count for the sticky "Show N results" button. */
  resultCount: number;
  /** Present only while something is narrowed — renders the Clear all action. */
  onClearAll?: () => void;
  children: ReactNode;
}

/**
 * Bottom-sheet filter panel for narrow screens (M56). `/shop`'s filters
 * used to expand inline above the grid — no scrim, no scroll lock, no
 * focus management, and applying a filter left you reading the sidebar
 * while the grid changed somewhere below. A sheet with a live "Show N
 * results" button is the pattern every food-ordering surface has taught
 * this audience (the 21st.dev bottom-sheet pattern, ported to CSS
 * Modules — never pasted).
 *
 * Dialog contract (CLAUDE.md, M16): focus moves in on open, Tab is
 * trapped via `lib/focus-trap` (never a private copy), Escape closes,
 * focus returns to the trigger, and the closed sheet is
 * `visibility: hidden` so it leaves the tab order. The scrim mirrors
 * `MobileDrawer`'s.
 */
export function MobileFilterSheet({
  open,
  onClose,
  resultCount,
  onClearAll,
  children,
}: MobileFilterSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      trapTab(panel, event);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={clsx(styles.scrim, open && styles.open)}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={clsx(styles.sheet, open && styles.open)}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        aria-hidden={!open}
      >
        <div className={styles.sheetHeader}>
          <span className={styles.eyebrow}>Filters</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close filters"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        <div className={styles.footer}>
          {onClearAll && (
            <button type="button" className={styles.clearAll} onClick={onClearAll}>
              Clear all
            </button>
          )}
          {/* The count updates live as boxes are ticked — filtering is a
              client-side useMemo (M49), so there is nothing to wait for
              and the button never needs a spinner. */}
          <button type="button" className={styles.apply} onClick={onClose}>
            Show {resultCount} {resultCount === 1 ? "result" : "results"}
          </button>
        </div>
      </div>
    </>
  );
}
