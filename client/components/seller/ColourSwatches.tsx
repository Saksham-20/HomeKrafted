"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import {
  CRAFT_PALETTE,
  PRIMARY_SWATCH_COUNT,
  colourWouldOverflow,
  hasColour,
  isLightSwatch,
  toggleColour,
} from "@/lib/sell/listing-colours";
import styles from "./ColourSwatches.module.css";

interface ColourSwatchesProps {
  /** The row's size label — the other half of the 40-character budget. */
  size: string;
  /** The row's current colours, as the stored comma-separated string. */
  value: string | undefined;
  onChange: (next: string) => void;
  /** Rendered above the swatches; omit inside a `<Field>` that has its own. */
  label?: string;
  className?: string;
}

/**
 * The colour picker both listing forms use.
 *
 * A swatch that would push the merged label past the server's cap is
 * **disabled and says why**, never removed — a colour that disappears when
 * you pick another one is a worse experience than one you cannot press,
 * and it hides the reason. The guard is in `lib/sell/listing-colours.ts`,
 * so the ceiling is computed against the server's constant rather than
 * restated here.
 */
export function ColourSwatches({
  size,
  value,
  onChange,
  label,
  className,
}: ColourSwatchesProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? CRAFT_PALETTE : CRAFT_PALETTE.slice(0, PRIMARY_SWATCH_COUNT);
  const hidden = CRAFT_PALETTE.length - PRIMARY_SWATCH_COUNT;

  return (
    <div className={clsx(styles.wrap, className)}>
      <div className={styles.head}>
        {label ? <span className={styles.label}>{label}</span> : <span />}
        <button type="button" className={styles.toggle} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `+ ${hidden} more`}
        </button>
      </div>
      <div className={styles.palette}>
        {shown.map((swatch) => {
          const selected = hasColour(value, swatch.name);
          const blocked = colourWouldOverflow(size, value, swatch.name);
          return (
            <button
              key={swatch.name}
              type="button"
              className={clsx(
                styles.swatch,
                selected && styles.swatchActive,
                blocked && styles.swatchBlocked,
              )}
              style={{ background: swatch.hex }}
              disabled={blocked}
              title={
                blocked
                  ? `${swatch.name} — no room left on this option's label. Add another option for more colours.`
                  : swatch.name
              }
              aria-label={
                blocked
                  ? `${swatch.name}, unavailable — no room left on this option's label`
                  : swatch.name
              }
              aria-pressed={selected}
              onClick={() => onChange(toggleColour(size, value, swatch.name))}
            >
              {selected && (
                <Check
                  size={13}
                  strokeWidth={3}
                  className={styles.check}
                  style={{ color: isLightSwatch(swatch.hex) ? "#111" : "#fff" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
