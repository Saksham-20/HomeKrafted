"use client";

import styles from "./GiftFinder.module.css";

export interface FinderOption {
  value: string;
  label: string;
}

export interface GiftFinderProps {
  recipients: FinderOption[];
  /** Dated occasions first, each already carrying its date in the label. */
  occasions: FinderOption[];
  budgets: FinderOption[];
  recipient: string;
  occasion: string;
  budget: string;
  onRecipient: (value: string) => void;
  onOccasion: (value: string) => void;
  onBudget: (value: string) => void;
}

/**
 * "A gift for ___ for ___ under ___" (G3 §5.1.2).
 *
 * **These three selects are the recipient, occasion and price controls.**
 * There is deliberately no second pill for any of them: two controls for
 * one filter is how a page ends up disagreeing with itself, and the
 * sentence is the more legible of the two because it says what the answer
 * is *for* — "a gift for her" rather than a checkbox called "Recipient".
 *
 * **Native `<select>`, not a custom listbox.** The same call as
 * `SortSelect`: a native select gets the platform's own picker on a phone,
 * types-to-jump on a keyboard and every assistive-technology affordance for
 * free, and no combobox we write is going to beat that for a list of eight
 * options. `Combobox` is for a list that grows past what a menu can hold.
 *
 * The whole thing is one `<form>` with no submit: each select applies on
 * change, because a gift finder with an "apply" button is a filter with a
 * step nobody asked for.
 *
 * **A clause with nothing to offer is not rendered** (measured 2026-09-16:
 * no live listing has answered the recipient attribute yet, so the first
 * select held the single option "anyone" — a control that cannot act).
 * The sentence closes over the gap rather than losing its grammar: with no
 * recipients it opens "A gift for any occasion…", with no occasions either
 * it reads "A gift under any budget". Same rule as a zero-count facet —
 * absence is shown as absence, never as a choice that does nothing.
 */
export function GiftFinder({
  recipients,
  occasions,
  budgets,
  recipient,
  occasion,
  budget,
  onRecipient,
  onOccasion,
  onBudget,
}: GiftFinderProps) {
  return (
    <form
      className={styles.sentence}
      // Nothing submits; Enter in a select must not reload the page.
      onSubmit={(event) => event.preventDefault()}
      aria-label="Find a gift"
    >
      {recipients.length > 0 && (
        <span className={styles.clause}>
          <span className={styles.word}>A gift for</span>
          <select
            className={styles.select}
            value={recipient}
            onChange={(event) => onRecipient(event.target.value)}
            aria-label="Who the gift is for"
          >
            <option value="">anyone</option>
            {recipients.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      )}

      {occasions.length > 0 && (
        <span className={styles.clause}>
          <span className={styles.word}>{recipients.length > 0 ? "for" : "A gift for"}</span>
          <select
            className={styles.select}
            value={occasion}
            onChange={(event) => onOccasion(event.target.value)}
            aria-label="The occasion"
          >
            <option value="">any occasion</option>
            {occasions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      )}

      <span className={styles.clause}>
        <span className={styles.word}>
          {recipients.length > 0 || occasions.length > 0 ? "under" : "A gift under"}
        </span>
        <select
          className={styles.select}
          value={budget}
          onChange={(event) => onBudget(event.target.value)}
          aria-label="Budget"
        >
          <option value="">any budget</option>
          {budgets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </form>
  );
}
