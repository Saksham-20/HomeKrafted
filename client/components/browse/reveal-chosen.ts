import { scrollBehavior } from "@/lib/motion";

/**
 * Bring the chosen tile of a horizontally scrolling rail into view.
 *
 * A shared link can select a shelf that sits off the edge of a rail, where
 * the highlight the rail exists to draw is out of sight. **Horizontal only**:
 * `scrollIntoView` would also scroll the *page* to the rail. `scrollBehavior()`
 * keeps the glide honest under reduced motion (a scripted scroll ignores the
 * media query). Nothing moves when the tile is already fully visible, so
 * pressing a tile the pointer is on never shifts it out from under the finger.
 *
 * `selector` finds the chosen tile inside `rail`; a rail that is not
 * scrollable (the desktop grid) always has it fully in view, so this is a
 * no-op there and the callers need no width check of their own.
 */
export function revealChosen(rail: HTMLElement | null, selector: string): void {
  const chosen = rail?.querySelector<HTMLElement>(selector);
  if (!rail || !chosen) return;
  const railBox = rail.getBoundingClientRect();
  const box = chosen.getBoundingClientRect();
  if (box.left >= railBox.left && box.right <= railBox.right) return;
  const target = box.left - railBox.left + rail.scrollLeft - (railBox.width - box.width) / 2;
  rail.scrollTo({ left: Math.max(0, target), behavior: scrollBehavior() });
}
