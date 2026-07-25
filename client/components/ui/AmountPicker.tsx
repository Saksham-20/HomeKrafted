"use client";

import { useState } from "react";
import clsx from "clsx";
import { formatCurrency } from "@/lib/format";
import styles from "./AmountPicker.module.css";

export interface AmountPickerProps {
  options: number[];
  value?: number;
  defaultValue?: number;
  onChange?: (amount: number) => void;
  disabled?: boolean;
  className?: string;
}

/** Top-up amount picker — 4-up grid of selectable amount tiles, ported from the Wallet screen. */
export function AmountPicker({
  options,
  value,
  defaultValue,
  onChange,
  disabled = false,
  className,
}: AmountPickerProps) {
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? options[0],
  );
  const selected = value ?? internalValue;

  const select = (amount: number) => {
    if (value === undefined) setInternalValue(amount);
    onChange?.(amount);
  };

  return (
    <div
      className={clsx(styles.grid, className)}
      role="radiogroup"
      aria-label="Top-up amount"
    >
      {options.map((amount) => {
        const isSelected = amount === selected;
        return (
          <button
            key={amount}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            className={clsx(styles.tile, isSelected && styles.selected)}
            onClick={() => select(amount)}
          >
            {formatCurrency(amount)}
          </button>
        );
      })}
    </div>
  );
}
