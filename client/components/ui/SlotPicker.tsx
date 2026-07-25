"use client";

import { useState } from "react";
import clsx from "clsx";
import styles from "./SlotPicker.module.css";

export interface SlotPickerOption {
  id: string;
  /** Bold primary label — day name ("Sun") for variant="day", or the slot's own label ("9 – 11 AM"). */
  primary: string;
  /** Secondary line under `primary` (day variant only), e.g. the date ("19 Jul"). */
  secondary?: string;
}

export interface SlotPickerProps {
  options: SlotPickerOption[];
  /** Controlled selected id. Omit to let the picker manage its own state. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** "day" = bold Fraunces day name + date line. "slot" = single centered label. */
  variant?: "day" | "slot";
  columns?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Day / slot picker — ported from the Laundry pickup-slot grid (used for
 * both the day row and the time-slot row).
 */
export function SlotPicker({
  options,
  value,
  defaultValue,
  onChange,
  variant = "slot",
  columns,
  disabled = false,
  className,
}: SlotPickerProps) {
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? options[0]?.id,
  );
  const selected = value ?? internalValue;

  const select = (id: string) => {
    if (value === undefined) setInternalValue(id);
    onChange?.(id);
  };

  return (
    <div
      className={clsx(styles.grid, className)}
      style={
        columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined
      }
      role="radiogroup"
    >
      {options.map((option) => {
        const isSelected = option.id === selected;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            className={clsx(
              styles.tile,
              styles[variant],
              isSelected && styles.selected,
            )}
            onClick={() => select(option.id)}
          >
            {variant === "day" ? (
              <>
                <b className={styles.dayLabel}>{option.primary}</b>
                {option.secondary}
              </>
            ) : (
              option.primary
            )}
          </button>
        );
      })}
    </div>
  );
}
