"use client";

import { useEffect, type RefObject } from "react";

/** Downward scroll, once pinned, during which the bar simply rides along. */
const HOLD_PX = 240;
/** Downward scroll over which it then fades out, tied to the scroll. */
const FADE_PX = 120;
/** How long without a scroll event counts as "the visitor stopped". */
const IDLE_MS = 120;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * A sticky bar that keeps out of the content's way without ever leaving
 * its place:
 *
 * 1. **It rides down with the page.** Once pinned it stays fully there for
 *    the first `HOLD_PX` of scrolling — nothing vanishes the instant the
 *    visitor moves.
 * 2. **Then it fades, in step with the scroll** (`FADE_PX`), lifting a few
 *    pixels and softening as it goes — a fade, not a slide off the top.
 * 3. **Any scroll up brings it straight back,** fading in where it is
 *    pinned (220ms ease-out).
 * 4. **Back at the top it is put down in its original place:** the sticky
 *    pin lets go and it sits in the page again, flat, as it started.
 *
 * Stopping half-faded finishes the way the visitor was going. Never fades
 * while focus is inside (an open filter popover, a keyboard user), and
 * focus coming in brings it back. Under reduced motion it is the same
 * opacity change with no movement. Writes styles straight onto the element
 * (no React state per scroll frame); `data-stuck` marks it floating, for
 * the stylesheet's shadow.
 */
export function useScrollAwayBar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let lastY = window.scrollY;
    let run = 0; // downward scroll since it was last fully shown
    let direction = 0;
    let frame = 0;
    let idle = 0;

    const pinnedTop = () => parseFloat(getComputedStyle(el).top || "0");
    // The sticky pin is in force: it is floating over the content rather
    // than sitting in its own place in the page.
    const isStuck = () => Math.round(el.getBoundingClientRect().top) <= Math.round(pinnedTop());

    /** 0 = fully shown, 1 = fully faded. */
    const progress = () => Math.min(1, Math.max(0, (run - HOLD_PX) / FADE_PX));

    const paint = (animate: boolean) => {
      const p = progress();
      el.style.transition = animate
        ? `opacity 220ms ${EASE_OUT}, transform 220ms ${EASE_OUT}, box-shadow 240ms ease`
        : "box-shadow 240ms ease";
      el.style.opacity = p ? String(1 - p) : "";
      el.style.transform = p && !reduced.matches ? `translate3d(0, ${-8 * p}px, 0) scale(${1 - 0.02 * p})` : "";
      el.style.pointerEvents = p > 0.5 ? "none" : "";
      el.toggleAttribute("data-stuck", isStuck());
    };

    const settle = () => {
      idle = 0;
      const p = progress();
      if (p === 0 || p === 1) return;
      run = direction > 0 ? HOLD_PX + FADE_PX : 0;
      paint(true);
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      if (delta) direction = Math.sign(delta);

      const wasHidden = progress() > 0;
      if (el.matches(":focus-within") || !isStuck()) {
        run = 0; // in its own place, or in use: always shown
      } else if (delta < 0) {
        run = 0; // any tick up: back
      } else {
        run += delta;
      }
      // Coming back is a short fade-in; going away follows the scroll.
      paint(wasHidden && progress() === 0);
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, IDLE_MS);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocusIn = () => {
      if (!progress()) return;
      run = 0;
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
      el.style.opacity = el.style.transform = el.style.transition = el.style.pointerEvents = "";
      el.removeAttribute("data-stuck");
    };
  }, [ref]);
}
