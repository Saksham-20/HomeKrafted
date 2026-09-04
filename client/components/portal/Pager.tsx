"use client";

import { Button } from "@/components/ui/Button";
import styles from "./Pager.module.css";

export interface PagerProps {
  page: number;
  lastPage: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

/** Previous / "Page 2 of 5" / Next. Renders nothing for a single page. */
export function Pager({ page, lastPage, onChange, disabled }: PagerProps) {
  if (lastPage <= 1) return null;
  return (
    <nav className={styles.pager} aria-label="Pages">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        Previous
      </Button>
      <span className={styles.label} aria-live="polite">
        Page {page} of {lastPage}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
