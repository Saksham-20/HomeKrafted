"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scrollBehavior } from "@/lib/motion";
import styles from "./ScrollRail.module.css";

export interface ScrollRailProps {
  children: React.ReactNode;
  /**
   * What the rail holds, as a noun phrase — it completes "Scroll ___
   * left". "categories", "reels", "makers". Never a sentence.
   */
  label: string;
  /** Layout for the scroller itself: the rail's gap, its items' widths, its padding. */
  className?: string;
  /** Passed to the scroller, for tests that need to address it. */
  id?: string;
}

/**
 * A horizontal rail: hidden scrollbar, faded edges, and chevron buttons
 * on pointer devices.
 *
 * **Why the scrollbar went.** Every rail on the site scrolled behind
 * `.hk-scroll`, a thin warm bar carried over from the prototype. On
 * Windows and Linux that renders as a full-width track sitting under the
 * content — on the home page's category rail it read as a page element
 * rather than an affordance, which is what prompted this. macOS and
 * every touch device hide their overlay bars until you scroll, so the
 * defect is invisible to half the people who would review it.
 *
 * **What replaced it is not "nothing".** `styles/globals.css` records the
 * rule this has to satisfy: a horizontally-scrolling strip must *look*
 * scrollable, or the row reads as complete and the items past the fold
 * are never found. Hiding the bar alone would be that regression. Three
 * things do the job instead — a fade at each end that appears only when
 * there is something that way, arrows that page the rail, and the native
 * swipe that was always the real interaction on a phone.
 *
 * **The fade is a mask, not a background.** `.hk-strip-fade` paints its
 * fade in the strip's own surface colour, which means every consumer has
 * to declare what it is sitting on (`--hk-strip-fade-bg`) and a rail over
 * a photograph or a tinted band cannot use it at all. Masking the content
 * to transparent has no such assumption. The cost is that JS decides when
 * each edge fades, where that recipe is pure CSS — worth it here because
 * the arrows need the same overflow state anyway, so the listener is not
 * a new cost.
 *
 * The arrows are hidden on `hover: none` — a coarse pointer scrolls the
 * rail directly, and the buttons would only cover content. `display:
 * none` is deliberate over `visibility`, so they leave the tab order too.
 */
export function ScrollRail({ children, label, className, id }: ScrollRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    // A pixel of slack: `scrollLeft` is fractional under browser zoom and
    // on high-DPI displays, so an exact comparison leaves a rail that is
    // scrolled fully right still claiming it can go further.
    const max = rail.scrollWidth - rail.clientWidth;
    setAtStart(rail.scrollLeft <= 1);
    setAtEnd(rail.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    measure();
    rail.addEventListener("scroll", measure, { passive: true });

    // Not a window resize listener: the rail's width changes when the
    // shell around it does (a sidebar collapsing, a drawer opening) with
    // no window event at all, and its scrollWidth changes when its own
    // children load. `ResizeObserver` catches both.
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    for (const child of Array.from(rail.children)) observer.observe(child);

    return () => {
      rail.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, children]);

  const page = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      // Just under a viewport, so the item at the edge stays half in shot
      // and the reader keeps their place. The floor is for a narrow rail,
      // where 80% of a small width is not a whole card.
      left: direction * Math.max(rail.clientWidth * 0.8, 220),
      // `behavior: "smooth"` ignores `prefers-reduced-motion` entirely —
      // it is a script instruction, not CSS. See `lib/motion.ts`.
      behavior: scrollBehavior(),
    });
  };

  // Nothing overflows: no fades, no arrows, and no buttons in the tab
  // order pointing at scroll that cannot happen.
  const overflowing = !(atStart && atEnd);

  return (
    <div className={styles.wrap}>
      {overflowing && !atStart && (
        <button
          type="button"
          className={clsx(styles.arrow, styles.arrowPrev)}
          onClick={() => page(-1)}
          aria-label={`Scroll ${label} left`}
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
      )}

      <div
        ref={railRef}
        id={id}
        className={clsx(
          styles.rail,
          overflowing && !atStart && styles.fadeStart,
          overflowing && !atEnd && styles.fadeEnd,
          className,
        )}
      >
        {children}
      </div>

      {overflowing && !atEnd && (
        <button
          type="button"
          className={clsx(styles.arrow, styles.arrowNext)}
          onClick={() => page(1)}
          aria-label={`Scroll ${label} right`}
        >
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}
