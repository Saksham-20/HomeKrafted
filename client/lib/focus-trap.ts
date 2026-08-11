/**
 * The focus half of the dialog contract (CLAUDE.md, M16).
 *
 * A dialog owes three things, not one: move focus in on open, trap Tab at
 * both ends, and restore focus to whatever opened it. `aria-modal` without
 * them is a claim the page does not honour — a keyboard or screen-reader
 * user opens a modal and then tabs straight through the content it is
 * covering.
 *
 * **Why this is a module rather than a third copy.** `MobileDrawer` and
 * `LocationPrompt` each carried their own inline `FOCUSABLE` string and
 * their own wrap arithmetic, and `ReelViewer` — a full-screen surface
 * claiming `aria-modal="true"` — had neither. Three private copies of one
 * recipe is the shape that has already gone wrong twice in this codebase
 * (the M28 moderation vocabulary, the pre-M16 `.hk-sr-only` duplicates),
 * and it fails invisibly here: a trap that gets the selector wrong lets
 * Tab escape and nothing looks broken.
 */

/**
 * Everything focusable inside a dialog, in DOM order.
 *
 * `[tabindex="-1"]` is excluded deliberately — an element taken out of the
 * tab order must not be a trap boundary. `ReelViewer`'s full-bleed
 * click-to-close scrim button relies on that: it is a real `<button>` for
 * pointer users and invisible to Tab, so the trap's first stop is the close
 * button a keyboard user actually wants.
 *
 * **The `:is()` wrapper is the fix for a real bug, not tidiness.** The M16
 * selector read `..., textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`,
 * where the `:not([tabindex="-1"])` qualified **only the final clause**. So
 * a `<button tabindex="-1">` still matched `button:not([disabled])` and was
 * returned as focusable — while the browser's own sequential navigation
 * correctly skipped it. Any trap whose first or last element was such a
 * button therefore compared `document.activeElement` against an element
 * focus can never land on, so the wrap never fired and Tab walked out.
 *
 * Measured in `ReelViewer`, which is the first dialog to contain one: the
 * focusable list came back as `[scrimHit(-1), Close, CTA, Next]`, Shift+Tab
 * from `Close` did not match `first`, and focus escaped into the reel cards
 * behind the player after four presses. `MobileDrawer` and `LocationPrompt`
 * carried the same latent hole and only got away with it because neither
 * contains a `tabindex="-1"` button.
 */
export const FOCUSABLE =
  ':is(a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]):not([tabindex="-1"])';

/** Focusable descendants of `container`, in DOM order. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Wrap Tab at both ends of `container`.
 *
 * Call it from a `keydown` handler; it returns without touching anything
 * unless the event is a Tab that would leave the dialog, so it is safe to
 * call before the handler's own key checks. Returns `true` when it moved
 * focus, for callers that want to know.
 */
export function trapTab(container: HTMLElement | null, event: KeyboardEvent): boolean {
  if (event.key !== "Tab" || !container) return false;

  const focusable = focusableWithin(container);
  // Nothing to trap against. Letting Tab through beats stranding focus on
  // an element that cannot receive it.
  if (focusable.length === 0) return false;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  // Without this, Tab walks out of the dialog and into the page it covers.
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
