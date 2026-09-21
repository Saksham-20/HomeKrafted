import type { ReactNode } from "react";
import { isPlaceholder } from "@/lib/legal";
import styles from "./LegalPage.module.css";

/**
 * A label above a value: a real one, or a plain statement that it is not
 * published yet. Shared by `/contact` and the grievance officer block, so
 * an unfilled detail reads identically wherever it appears.
 */
export function LegalDetail({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  /** Wrap a real value in a link (`mailto:`, `tel:`). Ignored while pending. */
  href?: string;
}): ReactNode {
  return (
    <div className={styles.detail}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>
        {isPlaceholder(value) ? (
          <span className={styles.pending}>not published yet</span>
        ) : href ? (
          <a href={href}>{value}</a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
