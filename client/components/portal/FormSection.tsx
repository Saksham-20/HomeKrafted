import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./FormSection.module.css";

export interface FormSectionStatus {
  label: string;
  /** `todo` — gold, something is missing here. `done` — pine. `neutral` — a fact. */
  tone?: "todo" | "done" | "neutral";
}

export interface FormSectionProps {
  /** Anchor for the page's section nav. Also makes the section focusable, so a jump lands focus as well as scroll. */
  id?: string;
  title: string;
  description?: ReactNode;
  status?: FormSectionStatus;
  /** Right-aligned control in the heading row — a "view live" link, a per-section save. */
  actions?: ReactNode;
  /**
   * `annotated` puts the title and description in a left column beside
   * the fields — the settings-page shape, where the explanation is most
   * of the content. `stacked` (default) is for a form somebody fills top
   * to bottom.
   */
  layout?: "stacked" | "annotated";
  /** A row under the fields — an in-section save button, a note. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * One titled group of fields on a card (2026-09-04).
 *
 * The long forms were each a stack of eight or nine `<Card>`s with an
 * `<h2>` on top, hand-assembled per screen — so the profile's cards had
 * 18px pine titles, the listing form's had no cards at all, and neither
 * could say "this part still needs you". A section here carries an
 * anchor, a status chip and a description slot, which is what lets a
 * page grow a jump-nav and a completion checklist without every screen
 * re-inventing them.
 */
export function FormSection({
  id,
  title,
  description,
  status,
  actions,
  layout = "stacked",
  footer,
  className,
  children,
}: FormSectionProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={headingId}
      className={clsx(styles.section, layout === "annotated" && styles.annotated, className)}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          {status && (
            <span
              className={clsx(
                styles.status,
                status.tone === "done" && styles.statusDone,
                status.tone === "neutral" && styles.statusNeutral,
                (status.tone ?? "todo") === "todo" && styles.statusTodo,
              )}
            >
              {status.label}
            </span>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}
