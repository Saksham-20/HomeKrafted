"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Reel, Vendor } from "@/lib/types";
import { scrollBehavior } from "@/lib/motion";
import { ReelCard } from "./ReelCard";
import { ReelViewer } from "./ReelViewer";
import styles from "./ReelsRailClient.module.css";

export interface ReelsRailClientProps {
  reels: Reel[];
  /** Whole vendor list (Home already fetches it) — used to resolve each reel's author line. */
  vendors: Vendor[];
}

/**
 * Home's reels rail — a horizontally snapping row of 9:16 cards that opens
 * a full-screen `<ReelViewer>`. Client-side because of the scroll buttons,
 * the in-view autoplay in `<ReelCard>` and the viewer's open index; Home
 * stays a server component and passes the data in (same split as
 * `HamperBuilderClient`).
 *
 * Arrow buttons page the rail by roughly one viewport of cards and are
 * hidden on touch widths, where the native snap scroll is the interaction.
 */
export function ReelsRailClient({ reels, vendors }: ReelsRailClientProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const authorNameFor = useCallback(
    (reel: Reel) => (reel.vendorId && vendorNameById.get(reel.vendorId)) || "Homekrafted",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is rebuilt from the same `vendors` prop each render
    [vendors],
  );

  const scrollBy = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    // `behavior: "smooth"` ignores the reduced-motion media query — see
    // `lib/motion.ts`. The rail still moves; it just jumps instead of gliding.
    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.8, 220),
      behavior: scrollBehavior(),
    });
  };

  if (reels.length === 0) return null;

  return (
    <>
      <div className={styles.railWrap}>
        <button
          type="button"
          className={clsx(styles.arrow, styles.arrowPrev)}
          onClick={() => scrollBy(-1)}
          aria-label="Scroll reels left"
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>

        {/* A stable id so `e2e/tests/focus-traps.spec.ts` can address a reel
            card without guessing at an accessible name — the whole card is
            the button (`ReelCard`), and its label is the reel's own copy. */}
        <div ref={railRef} id="hk-reels-rail" className={clsx(styles.rail, "hk-scroll")}>
          {reels.map((reel, index) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              authorName={authorNameFor(reel)}
              onOpen={() => setOpenIndex(index)}
            />
          ))}
        </div>

        <button
          type="button"
          className={clsx(styles.arrow, styles.arrowNext)}
          onClick={() => scrollBy(1)}
          aria-label="Scroll reels right"
        >
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <ReelViewer
        reels={reels}
        index={openIndex}
        authorNameFor={authorNameFor}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
