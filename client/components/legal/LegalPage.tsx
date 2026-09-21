import type { ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { LEGAL_ENTITY, POLICY_LAST_UPDATED, missingDetails } from "@/lib/legal";
import styles from "./LegalPage.module.css";

export interface LegalPageProps {
  title: string;
  /** One sentence under the title, saying what this document is for. */
  intro: string;
  /**
   * True on a page that prints the company's own details (`/contact`, the
   * grievance policy), which is the only kind of page the "not yet
   * published" banner can be honest about. Off by default: a cookies
   * policy names no address, and a banner calling it incomplete would be
   * a false statement about a document that is complete.
   */
  showsBusinessDetails?: boolean;
  children: ReactNode;
}

/**
 * Shared shell for every policy page: the seventeen client-reviewed
 * documents (`lib/policies/`, rendered by `PolicyDocument`) and `/contact`.
 *
 * The banner is the part worth explaining. While `lib/legal.ts` still
 * holds placeholders, a page that prints them says so at the top — because
 * a page carrying an invented address or officer is worse than an obviously
 * incomplete one. It looks compliant while being false, and the person
 * relying on it is a customer trying to get their money back. Filling in
 * `LEGAL_ENTITY` removes it, and it names what is missing rather than
 * claiming the whole document is unfinished.
 */
export function LegalPage({
  title,
  intro,
  showsBusinessDetails = false,
  children,
}: LegalPageProps) {
  const missing = showsBusinessDetails ? missingDetails() : [];

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

        {missing.length > 0 && (
          <div className={styles.banner} role="note">
            <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
            <p>
              <strong>Some business details are not published yet.</strong>{" "}
              Homekrafted&rsquo;s {joinWords(missing)}{" "}
              {missing.length === 1 ? "is" : "are"}{" "}still being finalised
              and shown below as &ldquo;not published yet&rdquo;. For anything
              urgent, email{" "}
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

/** "a", "a and b", "a, b and c". */
function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
