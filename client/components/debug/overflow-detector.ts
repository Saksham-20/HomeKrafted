/**
 * Development-only mobile overflow detector (P1-06).
 *
 * Scans the DOM tree for descendant elements where `scrollWidth > clientWidth`,
 * catching uncontained horizontal overflow that `overflow-x: hidden` would otherwise
 * silently mask.
 */

export interface OverflowingElement {
  element: HTMLElement;
  tagName: string;
  className: string;
  scrollWidth: number;
  clientWidth: number;
  excess: number;
}

export function detectOverflows(root: Element = document.body): OverflowingElement[] {
  if (typeof window === "undefined" || !root) return [];

  const overflowing: OverflowingElement[] = [];
  const candidates = root.querySelectorAll<HTMLElement>("*");

  candidates.forEach((el) => {
    // Skip unrendered elements or zero-width layouts
    if (!el.offsetWidth || !el.offsetHeight) return;

    // Skip deliberate scroll rails and carousels
    const style = window.getComputedStyle(el);
    if (
      style.overflowX === "auto" ||
      style.overflowX === "scroll" ||
      el.classList.contains("hk-scroll") ||
      el.getAttribute("role") === "region"
    ) {
      return;
    }

    const excess = el.scrollWidth - el.clientWidth;
    // Allow 1px tolerance for sub-pixel anti-aliasing / rounding
    if (excess > 1) {
      overflowing.push({
        element: el,
        tagName: el.tagName.toLowerCase(),
        className: el.className,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        excess,
      });
    }
  });

  return overflowing;
}

