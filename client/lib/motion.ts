/**
 * The JS half of honouring `prefers-reduced-motion`.
 *
 * `styles/globals.css` neutralises CSS transitions and animations under
 * the media query, but **`element.scrollTo({ behavior: "smooth" })`
 * ignores it entirely** — it is a script instruction, not a style — so a
 * visitor who asked the operating system for less motion still gets the
 * reel rail gliding sideways under their thumb. Every scripted scroll
 * reads this first.
 *
 * SSR-safe: no `window` during a server render, and the honest answer
 * there is "we don't know", which must not be "reduce" — that would ship
 * a static first paint to everybody and then start moving after
 * hydration. Anything calling this runs in an event handler anyway.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** `"auto"` when the visitor asked for less motion, `"smooth"` otherwise — pass straight to `scrollTo`/`scrollBy`. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
