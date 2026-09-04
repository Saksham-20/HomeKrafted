"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import styles from "./Field.module.css";

/**
 * The one form-field recipe for both portals (2026-09-04).
 *
 * Before this, thirteen CSS modules under `components/seller` and
 * `components/admin` each carried their own `.field / .label / .input`
 * block — the same eleven lines, copied, and drifting: the profile's
 * labels were 11px mono uppercase, the payout form's were 13px sans, the
 * `<Textarea>` primitive's were 13px medium, and the guided listing flow
 * had rightly abandoned the mono caption for a 16px question. A home
 * cook filling in the twenty-field profile was reading `PREPARATION TIME
 * (MINUTES)` in receipt type, which is the typographic register this
 * design system reserves for batch numbers and counts, not for the
 * question somebody is being asked.
 *
 * `Field` owns the label, the hint, the error and the wiring between
 * them; the controls (`Input`, `Select`, `TextArea`) read that wiring
 * from context so a caller never writes `htmlFor`, `aria-describedby`
 * or `aria-invalid` by hand — which is the version of the recipe that
 * gets one of them wrong. A control rendered outside a `Field` is still
 * a plain, correctly styled control.
 *
 * Two rules the components enforce rather than document:
 * - **Required is the default; only "optional" is marked.** A form where
 *   most fields carry an asterisk reads as a wall. `optional` prints the
 *   word beside the label.
 * - **An error is a sentence, announced.** `role="alert"` on the error
 *   line, `aria-invalid` on the control, and the border turns terracotta
 *   — never the border alone (the skill checklist's "red border only").
 */

interface FieldWiring {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

export interface FieldProps {
  label: ReactNode;
  /** Prints "Optional" beside the label. Absence means the field is expected. */
  optional?: boolean;
  /** One or two plain sentences under the control. */
  hint?: ReactNode;
  /** The refusal, in words somebody can act on. Rendered above the hint and announced. */
  error?: string;
  /** Inside a `FieldGrid`, span every column. */
  span?: "full";
  /** Pass when the control is not a native input (a `<Combobox>`, a chip row): the label is then rendered as text, not `<label for>`. */
  labelAsText?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  optional,
  hint,
  error,
  span,
  labelAsText,
  id: idProp,
  className,
  children,
}: FieldProps) {
  const auto = useId();
  const id = idProp ?? `field-${auto}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const LabelTag = labelAsText ? "span" : "label";

  return (
    <div className={clsx(styles.field, span === "full" && styles.fieldFull, className)}>
      <div className={styles.labelRow}>
        <LabelTag htmlFor={labelAsText ? undefined : id} className={styles.label}>
          {label}
        </LabelTag>
        {optional && <span className={styles.optional}>Optional</span>}
      </div>
      <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
        {children}
      </FieldContext.Provider>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Reads the enclosing `Field`'s wiring, if any. Exported for controls built outside this file (the Combobox, the character picker). */
export function useFieldWiring(): FieldWiring | null {
  return useContext(FieldContext);
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** A 40px control for dense rows (a price table), instead of the 44px default. */
  dense?: boolean;
  /** Text pinned inside the left edge — "₹". Decorative; say the unit in the label too. */
  affixStart?: ReactNode;
  /** Text pinned inside the right edge — "min", "km", "%". */
  affixEnd?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { dense, affixStart, affixEnd, className, id, ...rest },
  ref,
) {
  const wiring = useContext(FieldContext);
  const control = (
    <input
      ref={ref}
      id={id ?? wiring?.id}
      aria-describedby={rest["aria-describedby"] ?? wiring?.describedBy}
      aria-invalid={wiring?.invalid || undefined}
      className={clsx(
        styles.control,
        dense && styles.dense,
        affixStart && styles.hasStart,
        affixEnd && styles.hasEnd,
        wiring?.invalid && styles.invalid,
        className,
      )}
      {...rest}
    />
  );
  if (!affixStart && !affixEnd) return control;
  return (
    <span className={styles.affixWrap}>
      {affixStart && (
        <span className={styles.affixStart} aria-hidden="true">
          {affixStart}
        </span>
      )}
      {control}
      {affixEnd && (
        <span className={styles.affixEnd} aria-hidden="true">
          {affixEnd}
        </span>
      )}
    </span>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  dense?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { dense, className, id, children, ...rest },
  ref,
) {
  const wiring = useContext(FieldContext);
  return (
    <span className={styles.selectWrap}>
      <select
        ref={ref}
        id={id ?? wiring?.id}
        aria-describedby={rest["aria-describedby"] ?? wiring?.describedBy}
        aria-invalid={wiring?.invalid || undefined}
        className={clsx(
          styles.control,
          styles.select,
          dense && styles.dense,
          wiring?.invalid && styles.invalid,
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" className={styles.chevron} />
    </span>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows with its content up to `maxRows` lines, so a three-line answer is not typed into a twelve-line box. */
  autoGrow?: boolean;
  maxRows?: number;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { autoGrow, maxRows = 12, rows = 3, className, id, onInput, ...rest },
  ref,
) {
  const wiring = useContext(FieldContext);
  return (
    <textarea
      ref={ref}
      id={id ?? wiring?.id}
      rows={rows}
      aria-describedby={rest["aria-describedby"] ?? wiring?.describedBy}
      aria-invalid={wiring?.invalid || undefined}
      className={clsx(styles.control, styles.textarea, wiring?.invalid && styles.invalid, className)}
      onInput={(event) => {
        if (autoGrow) {
          const el = event.currentTarget;
          const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 24)}px`;
        }
        onInput?.(event);
      }}
      {...rest}
    />
  );
});

export interface CheckRowProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  /** What ticking it actually does, in one sentence. */
  help?: ReactNode;
}

/** A checkbox with its label and consequence in one 44px row. */
export function CheckRow({ label, help, className, ...rest }: CheckRowProps) {
  return (
    <label className={clsx(styles.checkRow, className)}>
      <input type="checkbox" {...rest} />
      <span className={styles.checkText}>
        <span className={styles.checkLabel}>{label}</span>
        {help && <span className={styles.checkHelp}>{help}</span>}
      </span>
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * An on/off control for a setting that takes effect as a state — "taking
 * new subscribers", "deduct commission" — as opposed to a checkbox, which
 * reads as one option among several. The whole row is the button, so the
 * words are a target too.
 */
export function Switch({ checked, onChange, label, help, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={clsx(styles.switchRow, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.switchText}>
        <span className={styles.switchLabel}>{label}</span>
        {help && <span className={styles.switchHelp}>{help}</span>}
      </span>
    </button>
  );
}

export interface FieldGridProps {
  columns?: 2 | 3;
  className?: string;
  children: ReactNode;
}

/** Two (or three) fields side by side; one column under 640px. */
export function FieldGrid({ columns = 2, className, children }: FieldGridProps) {
  return (
    <div className={clsx(styles.grid, columns === 3 && styles.grid3, className)}>{children}</div>
  );
}

export interface FieldsetProps {
  legend: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A group of related choices — chips, day toggles, radio cards — under one heading. */
export function Fieldset({ legend, optional, hint, className, children }: FieldsetProps) {
  return (
    <fieldset className={clsx(styles.fieldset, className)}>
      <legend className={styles.legend}>
        {legend}
        {optional && <span className={styles.optional}> Optional</span>}
      </legend>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </fieldset>
  );
}

/** A wrapping row of `<Chip>`s. */
export function ChipRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx(styles.chips, className)}>{children}</div>;
}
