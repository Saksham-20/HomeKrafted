"use client";

import { useState } from "react";
import type { FormEvent } from "react";
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    onSubmitted?.();
  }

  return (
    <form
      role="search"
      action="/search"
      method="get"
      onSubmit={handleSubmit}
      className={clsx(styles.form, variant === "block" && styles.block, className)}
    >
      <Search size={17} strokeWidth={1.7} className={styles.icon} aria-hidden="true" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
