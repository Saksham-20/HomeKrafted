"use client";

import { useId, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Search } from "lucide-react";
import styles from "./SearchForm.module.css";

export type SearchFormVariant = "pill" | "block";

export interface SearchFormProps {
  /** `pill` is the compact header affordance; `block` is the full-width one on `/search` and in the mobile drawer. */
  variant?: SearchFormVariant;
  /** Seeds the field when `/search` re-renders for an existing query. */
  defaultValue?: string;
  placeholder?: string;
  /** Called after a successful submit — the drawer uses it to close itself. */
  onSubmitted?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The site's search entry point, in both places it appears.
 *
 * A real `<form method="get" action="/search">`, so it still works with
 * JavaScript off and the browser offers its own query history; the
 * `onSubmit` handler intercepts to do a client-side `router.push`
 * instead, keeping the app-router navigation (and the header's cart/
 * wallet state) rather than reloading the document.
 *
 * An empty submit is swallowed — `/search` with no `q` is the "start
 * typing" state, and there is no reason to navigate to it from a field
 * the visitor just cleared.
 */
export function SearchForm({
  variant = "pill",
  defaultValue = "",
  placeholder = "Search homemade…",
  onSubmitted,
  autoFocus = false,
  className,
}: SearchFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const inputId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    onSubmitted?.();
  }

  // Escape gives the field back. In the header the `pill` variant expands
  // over the nav on focus (`Header.module.css`), so without this a
  // keyboard user could open it and have no way to close it again short
  // of tabbing all the way out — the same complaint as a dialog with no
  // dismiss. Blur is enough: the expansion is driven by `:focus-within`.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") event.currentTarget.blur();
  }

  return (
    <form
      role="search"
      action="/search"
      method="get"
      onSubmit={handleSubmit}
      className={clsx(styles.form, variant === "block" && styles.block, className)}
    >
      {/* The magnifier is a `<label>`, not decoration. In the header the
          pill collapses to roughly its own icon (see `Header.module.css`
          — the row has no width to spare), and at that size the icon *is*
          the control: clicking it has to put the caret in the field, the
          way it does on every other site. `htmlFor` is what buys that,
          with no click handler and no JavaScript.

          `aria-hidden` on the label, and the accessible name left on the
          input: the label carries no text, so associating it would other-
          wise leave the field named by `aria-label` and *also* labelled
          by an empty element. Verified against the sweep's axe pass
          (`label`, `form-field-multiple-labels`, `aria-hidden-focus` are
          all in its rule list) — a label is not focusable, so hiding it
          costs nothing. */}
      <label htmlFor={inputId} className={styles.iconLabel} aria-hidden="true">
        <Search size={17} strokeWidth={1.7} className={styles.icon} />
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search homemade products, HomeKrafters and snacks"
        className={styles.input}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {variant === "block" ? (
        <button type="submit" className={styles.submit}>
          Search
        </button>
      ) : (
        <button type="submit" className={styles.srOnlySubmit}>
          Search
        </button>
      )}
    </form>
  );
}
