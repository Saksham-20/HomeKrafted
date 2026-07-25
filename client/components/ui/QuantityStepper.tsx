"use client";

import { useState } from "react";
import clsx from "clsx";
import styles from "./QuantityStepper.module.css";

export interface QuantityStepperProps {
  /** Controlled value. Omit to let the stepper manage its own state. */
  value?: number;
  /** Starting value when uncontrolled. */
  defaultValue?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible label announced with the current value, e.g. "Quantity". */
  "aria-label"?: string;
}

/**
 * Quantity stepper — ported from the Product Detail add-to-cart control:
 * pill, 1.5px pine border, minus/value/plus. Works controlled (pass
 * `value` + `onChange`) or uncontrolled (pass `defaultValue`).
 */
export function QuantityStepper({
  value,
  defaultValue = 1,
  min = 1,
  max = 99,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Quantity",
}: QuantityStepperProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const current = value ?? internalValue;

  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (value === undefined) setInternalValue(clamped);
    onChange?.(clamped);
  };

  return (
    <div
      className={clsx(styles.stepper, disabled && styles.disabled, className)}
    >
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(current - 1)}
        disabled={disabled || current <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className={styles.value} aria-live="polite" aria-label={ariaLabel}>
        {current}
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(current + 1)}
        disabled={disabled || current >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
