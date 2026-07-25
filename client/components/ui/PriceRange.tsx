"use client";

import { useState } from "react";
import clsx from "clsx";
import { formatCurrency } from "@/lib/format";
import styles from "./PriceRange.module.css";

export interface PriceRangeProps {
  min: number;
  max: number;
  valueMin?: number;
  valueMax?: number;
  defaultValueMin?: number;
  defaultValueMax?: number;
  step?: number;
  onChange?: (range: [number, number]) => void;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Dual-handle price range — ported from the Shop filter aside's pine
 * track. The prototype renders this as a static decorative bar; here it's
 * two overlapping native range inputs (each showing only its own thumb),
 * which gives real pointer-drag + keyboard accessibility for free while
 * keeping the same visual track/fill/handle look.
 */
export function PriceRange({
  min,
  max,
  valueMin,
  valueMax,
  defaultValueMin,
  defaultValueMax,
  step = 1,
  onChange,
  formatValue = formatCurrency,
  disabled = false,
  className,
}: PriceRangeProps) {
  const [internalMin, setInternalMin] = useState(defaultValueMin ?? min);
  const [internalMax, setInternalMax] = useState(defaultValueMax ?? max);
  const currentMin = valueMin ?? internalMin;
  const currentMax = valueMax ?? internalMax;

  const setRange = (nextMin: number, nextMax: number) => {
    if (valueMin === undefined) setInternalMin(nextMin);
    if (valueMax === undefined) setInternalMax(nextMax);
    onChange?.([nextMin, nextMax]);
  };

  const handleMin = (raw: number) => setRange(Math.min(raw, currentMax - step), currentMax);
  const handleMax = (raw: number) => setRange(currentMin, Math.max(raw, currentMin + step));

  const pctMin = ((currentMin - min) / (max - min)) * 100;
  const pctMax = ((currentMax - min) / (max - min)) * 100;

  return (
    <div className={clsx(styles.wrap, disabled && styles.disabled, className)}>
      <div className={styles.track}>
        <span
          className={styles.fill}
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
        />
        <input
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={currentMin}
          onChange={(event) => handleMin(Number(event.target.value))}
          disabled={disabled}
          aria-label="Minimum price"
        />
        <input
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={currentMax}
          onChange={(event) => handleMax(Number(event.target.value))}
          disabled={disabled}
          aria-label="Maximum price"
        />
      </div>
      <div className={styles.labels}>
        <span>{formatValue(currentMin)}</span>
        <span>{formatValue(currentMax)}</span>
      </div>
    </div>
  );
}
