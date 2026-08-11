"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scroll a horizontal nav strip so the active item is visible.
 *
 * **The problem.** All three portal shells collapse their sidebar to a
 * horizontal strip below 780px. At 390px the strip is 356px wide and its
 * content is 1082px, so about four of ten items fit. M28 added edge fades
 * so it at least *looks* scrollable, but it always started at item one — so
 * a HomeKrafter on Payouts (866px into the strip) saw no sign of where they
 * were, and `aria-current="page"` pointed at something off-screen, which is
 * a screen reader announcing a position the sighted user cannot see.
 *
 * **What M28 got right, and the one thing it got wrong.** `TODOS.md`
 * recorded three findings and then correctly refused to ship an effect that
 * provably did not work. Findings 1 and 2 stand and are used below.
 * Finding 3 — "the effect runs and scrolls, and something resets
 * `scrollLeft` to 0 within 500ms; suspect App Router scroll restoration" —
 * named two hypotheses, a resetter and a remount. Measured at 390px against
 * a real seller session:
 *
 * - **There is no resetter.** Setting `scrollLeft = 739` on
 *   `/seller/payouts` clamped to the strip's maximum of 726 and was still
 *   726 twelve hundred milliseconds later, with no `scroll` event in
 *   between. Nothing in the app or the router writes it back. So there is
 *   deliberately **no watchdog** here re-applying the scroll against an
 *   imagined attacker — that would be a permanent rAF loop defending
 *   against something that is not happening.
 * - **It was the remount**, the other hypothesis. And it is specific:
 *   `SellerShell` gates its whole body behind an async HomeKrafter resolve,
 *   so the nav does not exist on the first effect pass, and `pathname` does
 *   not change afterwards — so an effect keyed on the pathname alone never
 *   ran again. Proven by the asymmetry: with a plain `useRef`, the account
 *   and admin strips scrolled correctly on every route and the seller strip
 *   stayed at 0 on all of them.
 *
 * That is why this takes a **callback ref** rather than a `RefObject`.
 * Attaching the node is what schedules the work, so a strip that mounts
 * late is handled by construction instead of by a timer.
 *
 * The two findings that stand:
 *
 * 1. `scrollIntoView({ inline: 'nearest' })` is a no-op on this strip.
 *    Setting `scrollLeft` directly is what moves it.
 * 2. `offsetLeft` is the wrong measure — the nav establishes no containing
 *    block, so `offsetParent` is `BODY` and it returns the item's distance
 *    from the page origin (987px) rather than from the scroll container.
 *    `getBoundingClientRect` deltas are container-relative and correct.
 *
 * Also, per CLAUDE.md: no `scroll-snap` on the strip. It was tried in M28
 * and re-snapped to the first item immediately after this kind of scroll.
 *
 * Reads the DOM and never the clock, so there is no React #418 exposure —
 * nothing here is derived during render.
 *
 * @param key Re-runs when this changes. In practice `usePathname()`.
 * @returns A callback ref to put on the scrolling strip.
 */
export function useScrollActiveIntoView(key: string | null) {
  /*
   * The node lives in a ref and the *fact that it attached* lives in state.
   *
   * Two constraints meet here. The effect has to re-run when a late-mounting
   * strip appears, which needs a dep that changes — a ref alone cannot do
   * that. But scrolling the element is a mutation of it, and the React
   * Compiler's immutability rule correctly refuses to let a `useState`
   * value be mutated. So: state is the trigger, the ref is the handle.
   */
  const stripRef = useRef<HTMLElement | null>(null);
  const [attachCount, setAttachCount] = useState(0);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const active = strip.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;

    // Nothing to scroll — the desktop layout is a vertical column, and a
    // strip that fits needs no help.
    if (strip.scrollWidth <= strip.clientWidth) return;

    const stripBox = strip.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();

    // Already fully in view: leave it alone. Re-centring an item somebody
    // can already see is a jump for nothing, and on the first tab
    // ("Dashboard") it would be a jump away from where the strip already is.
    if (activeBox.left >= stripBox.left - 1 && activeBox.right <= stripBox.right + 1) return;

    // Centre it where there is room; the browser clamps at both ends, so
    // the first and last items land flush rather than half off-screen.
    const delta = activeBox.left - stripBox.left;
    strip.scrollLeft += delta - (strip.clientWidth - activeBox.width) / 2;
  }, [attachCount, key]);

  return useCallback((node: HTMLElement | null) => {
    stripRef.current = node;
    // Only on attach. Bumping on detach too would re-run the effect against
    // a null ref for nothing.
    if (node) setAttachCount((n) => n + 1);
  }, []);
}
