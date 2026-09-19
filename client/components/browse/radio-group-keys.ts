import type { KeyboardEvent } from "react";

/**
 * Arrow-key navigation for a `role="radiogroup"` made of `role="radio"`
 * buttons — the WAI-ARIA pattern: the arrow keys move focus *and* choose,
 * Home/End jump to the ends, and the group is one Tab stop (each radio
 * sets `tabIndex` from whether it is the checked one).
 *
 * It clicks the target rather than being handed `onSelect`: the radios
 * already own what choosing means (`onClick`), so this stays a keyboard
 * layer over them and cannot drift from the pointer path. Put it on the
 * group element; key events bubble up from the radios.
 *
 * Only enabled radios take part, and it wraps at the ends. Vertical arrows
 * work too, because a radiogroup that wraps onto a second row (the
 * department grid) has no single "next" direction.
 */
export function radioGroupKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const { key } = event;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
  // Somebody pressing a modifier is doing something else (Alt+Left is Back).
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'),
  );
  const from = radios.findIndex((radio) => radio === document.activeElement);
  if (from === -1 || radios.length < 2) return;

  let to = from;
  if (key === "Home") to = 0;
  else if (key === "End") to = radios.length - 1;
  else if (key === "ArrowLeft" || key === "ArrowUp") to = (from - 1 + radios.length) % radios.length;
  else to = (from + 1) % radios.length;

  event.preventDefault();
  radios[to].focus();
  radios[to].click();
}
