import type { CSSProperties } from "react";
import clsx from "clsx";
import { snowflakes } from "@/lib/snow";
import styles from "./Snowfall.module.css";

export interface SnowfallProps {
  /**
   * `hero` sits inside the hero photograph and takes its fades; `footer` is
   * a band that thins out before the links; `band` falls past the Winter
   * Edit photographs and clear of its headline.
   */
  variant: "hero" | "footer" | "band";
  count: number;
  seed: number;
}

/**
 * Ambient snow for the season (2026-11-24) — the client asked for snowy
 * effects, "professional and minimal".
 *
 * CSS animation, not a canvas: the motion is predetermined, so it can run
 * on the compositor (transform + opacity only) and keeps going while the
 * page is busy, with no `requestAnimationFrame` loop on the main thread.
 * Each flake is a full-height column that falls by its own height —
 * `translateY(%)` is relative to the element itself — so no script ever
 * measures the area. Browsers pause it in a background tab on their own.
 *
 * Hidden until `<html data-snow="on">`, which `SnowToggle` sets after
 * mount unless the visitor has paused it (WCAG 2.2.2 — one control pauses
 * every snowing area) — so a visitor who turned it off never sees it
 * flash on. Never shown under `prefers-reduced-motion`. Decorative:
 * `aria-hidden`, no pointer events.
 */
export function Snowfall({ variant, count, seed }: SnowfallProps) {
  return (
    <div className={clsx(styles.snow, styles[variant])} aria-hidden="true">
      {snowflakes(count, seed).map((flake, index) => (
        <span
          key={index}
          className={styles.column}
          // Per-flake values are data, so they travel as custom properties.
          style={
            {
              "--x": `${flake.x}%`,
              "--size": `${flake.size}px`,
              "--fall": `${flake.fall}s`,
              "--delay": `${flake.delay}s`,
              "--sway": `${flake.sway}px`,
              "--sway-period": `${flake.swayPeriod}s`,
              "--o": flake.opacity,
            } as CSSProperties
          }
        >
          <span className={styles.flake} />
        </span>
      ))}
    </div>
  );
}
