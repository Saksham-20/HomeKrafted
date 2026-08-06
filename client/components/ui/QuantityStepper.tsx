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
  /**
   * The **name of the thing being counted**, e.g. "Mango Thokku Pickle" —
   * not a full sentence. The stepper composes every label from it.
   *
   * It reaches the −/+ buttons, which is the point: without it a cart of
   * three lines announces three identical "Increase quantity" buttons and
   * a screen reader user cannot tell which row they are on, while the
   * Remove button beside them has always named its product.
   */
  itemName?: string;
  /** Label for the value itself when there is no `itemName`. */
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
  itemName,
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
        aria-label={itemName ? `Decrease quantity of ${itemName}` : "Decrease quantity"}
      >
        −
      </button>
      <span
        className={styles.value}
        aria-live="polite"
        aria-label={itemName ? `Quantity of ${itemName}` : ariaLabel}
      >
        {current}
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(current + 1)}
        disabled={disabled || current >= max}
        aria-label={itemName ? `Increase quantity of ${itemName}` : "Increase quantity"}
      >
        +
      </button>
    </div>
  );
}
