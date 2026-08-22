"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import styles from "./Combobox.module.css";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional second line — a date, a count, whatever disambiguates two similar names. */
  hint?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /**
   * Selected values, always an array — single-select carries at most one.
   *
   * One shape for both modes on purpose: the alternative is a
   * discriminated union that every call site has to satisfy twice, and
   * two internal code paths that drift.
   */
  value: string[];
  onChange: (next: string[]) => void;
  /** Selected values render as removable chips and the list stays open between picks. */
  multiple?: boolean;
  label: string;
  /** Visually hide the label, keeping it for assistive tech. */
  hideLabel?: boolean;
  /**
   * `micro` is the portal's mono uppercase field label, right on a dense
   * screen of twenty fields. `plain` is a spoken question, for a screen
   * that asks one thing at a time — mixing the two on one screen reads as
   * two different forms stitched together.
   */
  labelTone?: "micro" | "plain";
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  /** Copy for "nothing matches what you typed", when creating isn't offered. */
  emptyMessage?: string;
  /**
   * Present only where creating is allowed — which in this product means
   * admin screens, for occasions.
   *
   * **This prop is an affordance, not a permission.** The gate is the
   * server: the create route lives under `/api/v1/admin`, so
   * `RolesGuard`'s fail-closed path rule covers it, and no `/seller/*`
   * route may write an `Occasion` at all (pinned by
   * `server/test/unit/occasion-admin-only.spec.ts`). A component that
   * merely hides this row would be decoration.
   *
   * Returns the created option, or `undefined` if it was refused — the
   * refusal message is thrown and shown by this component.
   */
  onCreate?: (typedLabel: string) => Promise<ComboboxOption | undefined>;
  /** Word for the thing being created, used in the create row: "Add “Onam” as a new occasion". */
  createNoun?: string;
  className?: string;
}

function normalise(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Searchable picker — WAI-ARIA editable combobox with list autocomplete,
 * single or multi select, and an optional create row.
 *
 * **Why this exists.** Occasions were a wall of `Chip` toggles on the
 * listing form. That reads fine at eleven and stops being usable at
 * thirty: there is nothing to type into, no way to find "Karwa Chauth"
 * except with your eyes, and the wall grows every festival somebody adds.
 * The same wall is what stopped anyone adding more.
 *
 * **No dependency.** A combobox is the one primitive people reach for a
 * library for, and this repo has no room for one: no Tailwind, no cva, no
 * headless-ui. The whole pattern is a text input, a listbox, and
 * `aria-activedescendant` — focus never leaves the input, which is what
 * makes the keyboard model work and what a `<div role="button">` list
 * would get wrong.
 *
 * The keyboard model is the specified one, not an approximation:
 * Down/Up move (and open), Alt+Down opens without moving, Home/End jump,
 * Enter commits the active row, Escape closes and then clears, Tab leaves
 * without committing, and Backspace on an empty query removes the last
 * chip in multi mode.
 */
export function Combobox({
  options,
  value,
  onChange,
  multiple = false,
  label,
  hideLabel = false,
  labelTone = "micro",
  placeholder,
  hint,
  disabled = false,
  emptyMessage = "Nothing matches that.",
  onCreate,
  createNoun = "option",
  className,
}: ComboboxProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = useMemo(
    () => value.map((v) => byValue.get(v)).filter((o): o is ComboboxOption => Boolean(o)),
    [value, byValue],
  );

  const matches = useMemo(() => {
    const q = normalise(query);
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
    );
  }, [options, query]);

  // The create row is offered only for a name that is not already in the
  // list — case-insensitively, and against every option rather than only
  // the filtered ones. Otherwise typing "diwali" next to an existing
  // "Diwali" offers to make a second one.
  const typed = query.trim();
  const canCreate =
    Boolean(onCreate) &&
    typed.length > 0 &&
    !options.some((o) => normalise(o.label) === normalise(typed));

  /** Rows are the matches plus, when offered, the create row at the end. */
  const rowCount = matches.length + (canCreate ? 1 : 0);
  const createIndex = canCreate ? matches.length : -1;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // Outside pointer closes. `pointerdown` rather than `click` so that
  // pressing on another control closes this before that control's own
  // handler runs and the list is not briefly overlapping what was hit.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      // Clear the filter on the way out. A half-typed query left sitting
      // in the box looks like a value, and in single-select mode it hides
      // the label of what is actually chosen.
      setQuery("");
      close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Keep the active row in view. `block: "nearest"` and no `behavior`, so
  // this is an instant scroll — a smooth one here would ignore
  // `prefers-reduced-motion` (a script scroll is not covered by the CSS
  // floor) and lag behind held arrow keys.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commitOption(option: ComboboxOption) {
    setError(null);
    if (multiple) {
      const next = value.includes(option.value)
        ? value.filter((v) => v !== option.value)
        : [...value, option.value];
      onChange(next);
      // Stay open and clear the query: picking several in a row is the
      // normal case here, and re-typing the filter each time is not.
      setQuery("");
      setActiveIndex(-1);
      inputRef.current?.focus();
      return;
    }
    onChange([option.value]);
    setQuery("");
    close();
    inputRef.current?.focus();
  }

  async function commitCreate() {
    if (!onCreate || !typed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(typed);
      if (created) commitOption(created);
    } catch (err) {
      // The server's sentence, verbatim. It is the only thing that says
      // what to change — a duplicate name and a rejected one read
      // differently and both matter.
      setError(err instanceof Error ? err.message : `Couldn't add that ${createNoun}.`);
    } finally {
      setCreating(false);
    }
  }

  function commitActive() {
    if (activeIndex < 0) return;
    if (activeIndex === createIndex) {
      void commitCreate();
      return;
    }
    const option = matches[activeIndex];
    if (option) commitOption(option);
  }

  function move(delta: number) {
    if (!open) {
      setOpen(true);
      setActiveIndex(delta > 0 ? 0 : rowCount - 1);
      return;
    }
    if (rowCount === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return rowCount - 1;
      if (next >= rowCount) return 0;
      return next;
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (event.altKey) {
          setOpen(true);
          return;
        }
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Home":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(rowCount - 1);
        return;
      case "Enter":
        if (!open || activeIndex < 0) return;
        // Only swallow Enter when it is actually picking something — a
        // combobox inside a form must not eat the submit key otherwise.
        event.preventDefault();
        commitActive();
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
          return;
        }
        if (query) {
          event.preventDefault();
          setQuery("");
        }
        return;
      case "Backspace":
        if (multiple && query === "" && value.length > 0) {
          event.preventDefault();
          onChange(value.slice(0, -1));
        }
        return;
      default:
    }
  }

  const singleSelected = !multiple ? selected[0] : undefined;
  const inputValue = open || multiple ? query : (query || singleSelected?.label) ?? "";

  return (
    <div className={clsx(styles.wrap, className)} ref={wrapRef}>
      <label
        className={clsx(
          labelTone === "plain" ? styles.labelPlain : styles.label,
          hideLabel && "hk-sr-only",
        )}
        htmlFor={inputId}
      >
        {label}
      </label>

      {multiple && selected.length > 0 && (
        <ul className={styles.tokens}>
          {selected.map((option) => (
            <li key={option.value}>
              <span className={styles.token}>
                {option.label}
                <button
                  type="button"
                  className={styles.tokenRemove}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v !== option.value))}
                  aria-label={`Remove ${option.label}`}
                >
                  <X size={12} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The list is anchored to the field, not to the wrapper: hanging it
          off `.wrap` put the hint line between the input and its own
          options, which reads as two unrelated controls. */}
      <div className={styles.anchor}>
      <div className={clsx(styles.field, open && styles.fieldOpen, disabled && styles.disabled)}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          className={styles.input}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={styles.toggle}
          disabled={disabled}
          tabIndex={-1}
          aria-label={open ? `Hide ${label} options` : `Show ${label} options`}
          onClick={() => {
            if (open) close();
            else {
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>

      {/* Announced, not just drawn. Without this a screen-reader user
          types and hears nothing about whether the list narrowed. */}
      <span className="hk-sr-only" role="status" aria-live="polite">
        {open ? `${rowCount} ${rowCount === 1 ? "result" : "results"}` : ""}
      </span>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        className={clsx(styles.list, !open && styles.listHidden)}
      >
        {matches.map((option, index) => {
          const isSelected = value.includes(option.value);
          return (
            <li
              key={option.value}
              id={`${baseId}-opt-${index}`}
              data-index={index}
              role="option"
              aria-selected={isSelected}
              className={clsx(
                styles.option,
                index === activeIndex && styles.active,
                isSelected && styles.selected,
              )}
              // The input keeps focus — `mousedown` default would move it
              // to the list and collapse everything before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => commitOption(option)}
            >
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{option.label}</span>
                {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
              </span>
              {isSelected && <Check size={15} strokeWidth={2} aria-hidden="true" />}
            </li>
          );
        })}

        {canCreate && (
          <li
            id={`${baseId}-opt-${createIndex}`}
            data-index={createIndex}
            role="option"
            aria-selected={false}
            className={clsx(styles.option, styles.create, createIndex === activeIndex && styles.active)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActiveIndex(createIndex)}
            onClick={() => void commitCreate()}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            <span className={styles.optionText}>
              {creating ? `Adding “${typed}”…` : `Add “${typed}” as a new ${createNoun}`}
            </span>
          </li>
        )}

        {rowCount === 0 && (
          <li className={styles.empty} role="presentation">
            {emptyMessage}
          </li>
        )}
      </ul>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
