import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./Toolbar.module.css";

export interface ToolbarProps {
  /** A `<SearchField>`, usually. Takes the flexible width. */
  search?: ReactNode;
  /** Filters, selects, segmented groups — wrap in reading order. */
  children?: ReactNode;
  /** Right-aligned — a count, a secondary action. */
  end?: ReactNode;
  className?: string;
}

/**
 * The control row above a queue or a list: search on the left, filters
 * after it, anything else on the right. One row that wraps, instead of
 * the two or three stacked chip rows each admin screen had grown.
 */
export function Toolbar({ search, children, end, className }: ToolbarProps) {
  return (
    <div className={clsx(styles.toolbar, className)}>
      {search && <div className={styles.search}>{search}</div>}
      {children}
      {end && <div className={styles.end}>{end}</div>}
    </div>
  );
}
