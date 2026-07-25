import type { TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./Textarea.module.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  className?: string;
}

/** Multiline textarea — ported from the Laundry "special instructions" field. */
export function Textarea({
  label,
  hint,
  id,
  className,
  rows = 4,
  ...rest
}: TextareaProps) {
  const autoId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className={clsx(styles.field, className)}>
      {label && (
        <label htmlFor={autoId} className={styles.label}>
          {label}
        </label>
      )}
      <textarea id={autoId} rows={rows} className={styles.textarea} {...rest} />
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
