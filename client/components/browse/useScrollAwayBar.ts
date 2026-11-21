"use client";

import { useEffect, type RefObject } from "react";

/** iOS's drawer curve: quick to answer, long soft settle. */
const SETTLE = "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)";
/** Kept on every write: an inline `transition` replaces the stylesheet's. */
const SHADOW = "box-shadow 240ms ease";
/** How long without a scroll event counts as "the visitor stopped". */
const IDLE_MS = 110;

/**
 * A sticky bar that gets out of the way of the content and comes back the
 * moment the visitor scrolls up — the way Safari's toolbar does it.
 *
 * - **Scroll-linked, not timed.** While the page moves, the bar's offset
 *   moves with it 1:1 (clamped to its own height), so it is pushed off by
 *   the content rather than flying away on a timer, and a small scroll up
 *   brings back exactly that much of it.
 * - **Settles by direction.** When scrolling stops with the bar part-way
 *   out, it finishes the way the visitor was last going (the velocity's
 *   sign, not the nearest end), on a short spring-like ease.
 * - **Never moves away from someone using it:** focus inside (an open
 *   filter popover, a keyboard user) holds it in place.
 * - **Reduced motion:** no travel at all — it is either there or not,
 *   decided at the same settle points, with no slide.
 *
 * Writes `transform` straight onto the element (no React state per
 * scroll frame) and sets `data-stuck` while it floats over content, which
 * the stylesheet uses for its shadow.
 */
export function useScrollAwayBar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let lastY = window.scrollY;
    let offset = 0; // px the bar is pushed up, 0..travel
    let direction = 0; // +1 down, -1 up
    let frame = 0;
    let idle = 0;

    // Its own height plus the gap above it and room for the shadow.
    const travel = () => el.offsetHeight + parseFloat(getComputedStyle(el).top || "0") + 16;
    // The offset actually on screen right now — mid-settle it is neither
    // end, and that is where a new scroll must pick up from, not the target.
    const liveOffset = () => {
      const m = getComputedStyle(el).transform;
      return m && m !== "none" ? -new DOMMatrixReadOnly(m).m42 : 0;
    };
    // Stuck = the sticky offset is in force, i.e. it is floating over content.
    const isStuck = () => {
      const top = parseFloat(getComputedStyle(el).top || "0");
      return Math.round(el.getBoundingClientRect().top + liveOffset()) <= Math.round(top);
    };

    const paint = (animate: boolean) => {
      el.style.transition = animate && !reduced.matches ? `${SETTLE}, ${SHADOW}` : SHADOW;
      el.style.transform = offset ? `translate3d(0, ${-offset}px, 0)` : "";
      el.toggleAttribute("data-stuck", isStuck());
    };

    const settle = () => {
      idle = 0;
      const max = travel();
      if (offset === 0 || offset === max) return;
      offset = direction > 0 ? max : 0;
      paint(true);
      el.addEventListener("transitionend", () => el.toggleAttribute("data-stuck", isStuck()), { once: true });
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      if (delta) direction = Math.sign(delta);

      const max = travel();
      offset = Math.min(max, Math.max(0, liveOffset())); // interrupt from the presentation value
      if (el.matches(":focus-within") || !isStuck()) {
        offset = 0; // in its own place on the page, or in use: never pushed away
      } else if (reduced.matches) {
        // No travel: jump between the ends, only once the run is deliberate.
        if (delta > 0 && y > max) offset = max;
        else if (delta < 0) offset = 0;
      } else {
        offset = Math.min(max, Math.max(0, offset + delta));
      }
      paint(false);
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, IDLE_MS);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocusIn = () => {
      if (!offset) return;
      offset = 0;
      paint(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("focusin", onFocusIn);
    paint(false);
    return () => {
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("focusin", onFocusIn);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      el.style.transform = el.style.transition = "";
      el.removeAttribute("data-stuck");
    };
  }, [ref]);
}
