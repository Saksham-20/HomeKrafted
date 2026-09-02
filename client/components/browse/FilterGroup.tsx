"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import styles from "./FilterGroup.module.css";

export interface FilterOption {
  id: string;
  label: string;
  /** How many of the currently loaded listings carry this facet. */
  count: number;
  checked: boolean;
}

/**
 * A labelled run of options inside one group — the M58 subcategory
 * trees rendered as what they are ("Shop by cuisine" over its
 * cuisines) instead of as a flat list where the parent shows up as
 * one more zero-count checkbox between its own children.
 */
export interface FilterSection {
  label: string;
  options: FilterOption[];
}

export interface FilterGroupProps {
  title: string;
  options: FilterOption[];
  /** Rendered after `options`, each under its own small label. */
  sections?: FilterSection[];
  onToggle: (id: string) => void;
  /** Collapsed on first render — for long tail groups. */
  defaultOpen?: boolean;
}

/**
 * One facet of a browse sidebar (M56; rebuilt in M59): a collapsible
 * group — heading, active-count badge, chevron — over checkbox rows
 * with per-option counts, shared by `/shop` and `/gifts`.
 *
 * A zero-count option is dimmed and disabled, never hidden: a count of
 * zero is information ("we have no bakery near you today"), and a facet
 * that vanishes and reappears as stock changes is a filter list nobody
 * can learn. What M59 adds is *order*: options someone can actually use
 * sort ahead of the zero-count tail, so the useful rows are not
 * scattered through forty dimmed ones. A *checked* option is never
 * disabled, even at zero, or the filter that emptied the grid could not
 * be switched off — and it also never sorts into the tail, so the
 * checkbox that emptied the grid stays where the eye left it.
 *
 * Collapsing hides nothing permanently — it is the visitor's own fold,
 * with the active count on the header saying what the fold is hiding.
 */
export function FilterGroup({ title, options, sections, onToggle, defaultOpen = true }: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  const activeCount =
    options.filter((o) => o.checked).length +
    (sections ?? []).reduce((n, s) => n + s.options.filter((o) => o.checked).length, 0);

  return (
    <div className={styles.filterGroup}>
      <button
        type="button"
        className={styles.groupHeader}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.filterTitle}>{title}</span>
        {activeCount > 0 && (
          <span className={styles.activeBadge} aria-label={`${activeCount} selected`}>
            {activeCount}
          </span>
        )}
        <ChevronDown size={15} strokeWidth={2} className={clsx(styles.chevron, open && styles.chevronOpen)} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className={styles.groupBody}>
          <FilterOptionList options={options} onToggle={onToggle} />
          {(sections ?? [])
            .filter((section) => section.options.length > 0)
            .map((section) => (
              <div key={section.label} className={styles.section}>
                <div className={styles.sectionLabel}>{section.label}</div>
                <FilterOptionList options={section.options} onToggle={onToggle} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * The bare option rows, exported for the pill popovers (M59b) — same
 * partition rule, no group chrome.
 */
export function FilterOptionList({ options, onToggle }: { options: FilterOption[]; onToggle: (id: string) => void }) {
  // Usable rows first, the dimmed zero-count tail after — a partition,
  // not a re-sort, so rows keep their given order within each half.
  const ordered = [
    ...options.filter((o) => o.count > 0 || o.checked),
    ...options.filter((o) => o.count === 0 && !o.checked),
  ];
  return (
    <>
      {ordered.map((option) => (
        <label
          key={option.id}
          className={clsx(
            styles.checkboxRow,
            option.count === 0 && !option.checked && styles.checkboxRowEmpty,
            option.checked && styles.checkboxRowChecked,
          )}
        >
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={option.checked}
            disabled={option.count === 0 && !option.checked}
            onChange={() => onToggle(option.id)}
          />
          <span className={styles.optionLabel}>{option.label}</span>
          <span className={styles.count}>{option.count}</span>
        </label>
      ))}
    </>
  );
}
