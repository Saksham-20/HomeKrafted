"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
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
 * The thumb's diameter, in pixels — declared here and handed to the
 * stylesheet as `--thumb`, because both sides genuinely need the number
 * and two copies of it is what produced the misalignment described below.
 */
const THUMB_PX = 16;

/**
 * Dual-handle price range — ported from the Shop filter aside's pine
 * track. The prototype renders this as a static decorative bar; here it's
 * two overlapping native range inputs (each showing only its own thumb),
 * which gives real pointer-drag + keyboard accessibility for free while
 * keeping the same visual track/fill/handle look.
 *
 * **The fill is inset by half a thumb at each end, and that is the fix
 * for a real misalignment (2026-09-05).** A native range thumb does not
 * travel the full width of its input: at `min` its *centre* sits half a
 * thumb in from the left edge, and at `max` half a thumb in from the
 * right, so the distance it actually covers is `100% - THUMB`. The fill
 * was positioned as a plain percentage of the whole width, so at both
 * extremes it ran ~8px past the handles at either end — which reads as a
 * bar with two dots loose on top of it rather than a range with two
 * grips. Every position in between was wrong by a shrinking amount, so
 * dragging a handle showed the fill sliding out from under it.
 *
 * The arithmetic below maps a percentage onto that reduced span and then
 * shifts it back by half a thumb, which is exactly where the browser puts
 * the handle. `calc()` in an inline style is the sanctioned exception to
 * the no-inline-styles rule — these are genuinely dynamic values, like
 * `<ImageSlot>`'s aspect ratio.
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

  // Guard the degenerate bound (one listing, or every listing the same
  // price): `max === min` divides by zero and puts both handles at NaN%,
  // which renders as a slider with no handles at all.
  const span = max - min || 1;
  const pctMin = ((currentMin - min) / span) * 100;
  const pctMax = ((currentMax - min) / span) * 100;

  /** Where the browser actually paints a handle at this percentage. */
  const atPct = (pct: number) => `calc(${pct / 100} * (100% - ${THUMB_PX}px) + ${THUMB_PX / 2}px)`;

  return (
    <div
      className={clsx(styles.wrap, disabled && styles.disabled, className)}
      style={{ "--thumb": `${THUMB_PX}px` } as CSSProperties}
    >
      <div className={styles.track}>
        <span
          className={styles.fill}
          style={{ left: atPct(pctMin), right: `calc(100% - ${atPct(pctMax)})` }}
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
      {/* One reading, not two — see `.labels`. The dash is decoration
          between two values that are already read out by the inputs'
          own accessible names, so it is hidden from assistive tech
          rather than announced as "to". */}
      <div className={styles.labels}>
        <span>{formatValue(currentMin)}</span>
        <span className={styles.labelDash} aria-hidden="true">
          –
        </span>
        <span>{formatValue(currentMax)}</span>
      </div>
    </div>
  );
}
