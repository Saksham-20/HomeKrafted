import type { ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { LEGAL_ENTITY, POLICY_LAST_UPDATED, hasPlaceholders } from "@/lib/legal";
import styles from "./LegalPage.module.css";

export interface LegalPageProps {
  title: string;
  /** One sentence under the title, saying what this document is for. */
  intro: string;
  children: ReactNode;
}

/**
 * Shared shell for the four policy pages (M18): terms, privacy, refunds,
 * contact.
 *
 * The banner is the part worth explaining. While `lib/legal.ts` still
 * holds placeholders, every policy page says so at the top — because a
 * policy carrying an invented company name and address is worse than an
 * obviously incomplete one. It looks compliant while being false, and the
 * person relying on it is a customer trying to get their money back.
 * Filling in `LEGAL_ENTITY` removes it from all four pages at once.
 */
export function LegalPage({ title, intro, children }: LegalPageProps) {
  const incomplete = hasPlaceholders();

  return (
    <article className={clsx("container", "container-prose")}>
      {/*
        `.page`'s own `max-width: 760px` used to sit on this same element
        alongside `container`/`container-prose` (both 1180px) — fixed
        2026-09-17 (B13, docs/UI-REFINEMENT.md). All three are single-class
        selectors, but `body:has([data-surface="consumer"]) .container`
        (the consumer-surface width rule) carries an attribute selector
        inside `:has()`, giving it specificity (0,2,1) — higher than any
        same-shape doubled `.page.page` (0,2,0) fix can reach without an
        arms race. Splitting `.page` onto its own inner element, with no
        competing `container` class on it, sidesteps the specificity fight
        entirely rather than trying to win it.
      */}
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <p className={styles.updated}>Last updated {POLICY_LAST_UPDATED}</p>
        </header>

        {incomplete && (
          <div className={styles.banner} role="note">
            <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
            <p>
              <strong>This policy is not yet complete.</strong>{" "}Homekrafted&rsquo;s
              registered business details are still being finalised, so the
              company name, address and phone number below are placeholders.
              Everything describing how the service actually works is
              accurate. For anything urgent, email{" "}
              <a href={`mailto:${LEGAL_ENTITY.supportEmail}`}>
                {LEGAL_ENTITY.supportEmail}
              </a>
              .
            </p>
          </div>
        )}

        <div className={styles.body}>{children}</div>
      </div>
    </article>
  );
}
