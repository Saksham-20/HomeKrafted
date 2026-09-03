"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The rotation behind both featured strips (M59c): a window of `visible`
 * items sliding one step through `total` every few seconds.
 *
 * Rules it enforces so neither strip has to remember them:
 * - **Never rotates during SSR or the first paint** — the interval
 *   starts in an effect, so server and browser render the same window
 *   (the M12 React #418 lesson).
 * - **Honours `prefers-reduced-motion`** via `lib/motion.ts` — a script
 *   interval is a script instruction; the CSS floor cannot stop it.
 * - **Pauses under the pointer and under focus** (spread the returned
 *   handlers on the container) — content must not move while somebody is
 *   reading or keyboard-navigating it.
 * - **No rotation when everything already fits** (`total <= visible`).
 */
export function useFeaturedRotation(total: number, visible: number, tickMs = 4500) {
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const rotates = total > visible;

  useEffect(() => {
    if (!rotates || paused || prefersReducedMotion()) return;
    const id = setInterval(() => setOffset((o) => (o + 1) % total), tickMs);
    return () => clearInterval(id);
  }, [rotates, paused, total, tickMs]);

  return {
    offset,
    pauseHandlers: {
      onMouseEnter: () => setPaused(true),
      onMouseLeave: () => setPaused(false),
      onFocusCapture: () => setPaused(true),
      onBlurCapture: () => setPaused(false),
    },
  };
}

/** The current window of `visible` items, wrapping past the end. */
export function rotationWindow<T>(items: T[], offset: number, visible: number): T[] {
  const count = Math.min(visible, items.length);
  return Array.from({ length: count }, (_, i) => items[(offset + i) % items.length]);
}
