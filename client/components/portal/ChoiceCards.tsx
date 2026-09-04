"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./ChoiceCards.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  /** What choosing it means, in one line. */
  hint?: ReactNode;
}

export interface ChoiceCardsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name for the group — the question being asked. */
  label: string;
  columns?: 2 | 3;
  className?: string;
}

/**
 * One-of-N as large cards with a title and a consequence — the pattern
 * the guided listing flow (M45) settled on for "what are you listing?",
 * now shared. A chip says "Homemade food"; a card says what happens if
 * you pick it, which is the difference between a choice and a guess for
 * somebody filling this in for the first time.
 *
 * Buttons with `aria-pressed`, not radios: a radio group needs arrow-key
 * navigation to be honest, and a set of two or three large targets is
 * better served by Tab landing on each.
 */
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  label,
  columns = 2,
  className,
}: ChoiceCardsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(styles.choices, columns === 3 && styles.three, className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            className={clsx(styles.choice, on && styles.choiceOn)}
            onClick={() => onChange(option.value)}
          >
            <span className={styles.title}>{option.title}</span>
            {option.hint && <span className={styles.hint}>{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
