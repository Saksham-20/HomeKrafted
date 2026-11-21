"use client";

import { useEffect, useState } from "react";

/**
 * `true` while the visitor is scrolling down the page, `false` the moment
 * they scroll back up — the pattern a sticky toolbar uses so it gets out
 * of the way of the grid without making anybody scroll to the top to
 * filter again.
 *
 * Asymmetric on purpose: hiding needs a deliberate run downward
 * (`hideAfter` px since the last change of direction), showing needs only
 * a tick upward (`showAfter`), because a toolbar that is slow to come
 * back reads as lost. Nothing hides above `minY`, where the bar is still
 * in its own place in the page rather than stuck over the grid.
 */
export function useHideOnScrollDown({ minY = 200, hideAfter = 24, showAfter = 4 } = {}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let anchorY = lastY; // where the current direction of travel began
    let goingDown = false;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const down = y > lastY;
      if (y !== lastY && down !== goingDown) {
        goingDown = down;
        anchorY = lastY;
      }
      lastY = y;
      if (y <= minY) setHidden(false);
      else if (goingDown && y - anchorY >= hideAfter) setHidden(true);
      else if (!goingDown && anchorY - y >= showAfter) setHidden(false);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [minY, hideAfter, showAfter]);

  return hidden;
}
