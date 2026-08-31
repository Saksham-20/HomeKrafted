"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./BrowsePagination.module.css";

export interface BrowsePaginationProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

/**
 * The pages a windowed pagination row shows: every page up to seven,
 * otherwise first + last + the current page's neighbours, with `null`
 * marking each gap. Exported for its spec.
 */
export function paginationWindow(totalPages: number, currentPage: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, currentPage]);
  if (currentPage - 1 >= 1) pages.add(currentPage - 1);
  if (currentPage + 1 <= totalPages) pages.add(currentPage + 1);
  const ordered = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const page of ordered) {
    if (page - previous > 1) out.push(null);
    out.push(page);
    previous = page;
  }
  return out;
}

/**
 * Numbered pagination with prev/next and a window (M56). The plain
 * every-page row was fine at four pages; the M56 catalogue puts `/shop`'s
 * dish view at six-plus, and a row of a dozen 44px buttons wraps into a
 * keypad. First and last stay reachable in one tap — "how much is there"
 * is half of what pagination communicates.
 */
export function BrowsePagination({ totalPages, currentPage, onPageChange }: BrowsePaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label="Pages">
      <button
        type="button"
        className={styles.pageBtn}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {paginationWindow(totalPages, currentPage).map((page, index) =>
        page === null ? (
          // Presentational: the gap is visible, and a screen reader
          // hearing "1, 4, 5, 6, 12" already hears it.
          <span key={`gap-${index}`} className={styles.gap} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            className={clsx(styles.pageBtn, page === currentPage && styles.pageActive)}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        className={styles.pageBtn}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </nav>
  );
}
