"use client";

import { useEffect } from "react";
import { detectOverflows } from "./overflow-detector";

/**
 * Renders in development mode only to detect descendant overflow on mobile viewports (P1-06).
 */
export function MobileOverflowDetector() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    function check() {
      if (window.innerWidth > 768) return; // Focus on mobile widths
      const items = detectOverflows();
      if (items.length > 0) {
        console.warn(
          `[MobileOverflowDetector] Found ${items.length} overflowing element(s):`,
          items.map((item) => ({
            tag: item.tagName,
            class: item.className,
            excessPx: Math.round(item.excess),
            clientWidth: item.clientWidth,
            scrollWidth: item.scrollWidth,
          })),
        );
      }
    }

    const timer = setTimeout(check, 1000);
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", check);
    };
  }, []);

  return null;
}
