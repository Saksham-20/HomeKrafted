import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./StickySummary.module.css";

export interface StickySummaryLine {
  label: ReactNode;
  value: ReactNode;
  /** Bold Fraunces total row — solid top divider instead of a dashed one. */
  emphasis?: boolean;
}

export interface StickySummaryProps {
  title?: string;
  /**
   * Content between the title and the line items — e.g. a
   * `<CapacityMeter>` (Hamper basket, M3). Optional, additive slot; every
   * existing call site that doesn't pass it renders exactly as before.
   */
  beforeLines?: ReactNode;
  lines: StickySummaryLine[];
  /** e.g. "Pay with wallet · earn ₹18 cashback" — renders with a wallet glyph. */
  cashbackLabel?: string;
  /** Primary CTA slot — typically a full-width <Button>. */
  children?: ReactNode;
  footnote?: string;
  className?: string;
  /**
   * Pins the CTA to a full-width bar fixed to the bottom of the viewport
   * below ~640px (M3) — the rest of the card stays in normal flow above
   * it, so a long scrollable list (Hamper's fill grid, a big cart) never
   * buries the primary action below the fold. Opt-in and off by default
   * so existing/future call sites (e.g. a Laundry booking summary) don't
   * get this behavior unless they ask for it.
   */
  stickyOnMobile?: boolean;
}

/**
 * Sticky summary aside — ported from the Hamper basket / Laundry booking
 * summary / Snacks list panels: white, bordered, dashed line-item rows, a
 * bold Fraunces total, an optional wallet-cashback line, and a CTA slot.
 */
export function StickySummary({
  title,
  beforeLines,
  lines,
  cashbackLabel,
  children,
  footnote,
  className,
  stickyOnMobile = false,
}: StickySummaryProps) {
  return (
    <div className={clsx(styles.summary, stickyOnMobile && styles.pinCta, className)}>
      {title && <span className={styles.title}>{title}</span>}
      {beforeLines && <div className={styles.beforeLines}>{beforeLines}</div>}
      <div className={styles.lines}>
        {lines.map((line, index) => (
          <div
            key={index}
            className={clsx(styles.line, line.emphasis && styles.emphasis)}
          >
            <span>{line.label}</span>
            <span>{line.value}</span>
          </div>
        ))}
      </div>
      {cashbackLabel && (
        <div className={styles.cashback}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <rect x="3" y="6" width="18" height="13" rx="3" />
          </svg>
          {cashbackLabel}
        </div>
      )}
      {children && <div className={styles.cta}>{children}</div>}
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </div>
  );
}
