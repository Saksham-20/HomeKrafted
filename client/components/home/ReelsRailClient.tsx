"use client";

import { useCallback, useState } from "react";
import type { Reel, Vendor } from "@/lib/types";
import { ScrollRail } from "@/components/ui/ScrollRail";
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
 * The rail's own scrolling — hidden scrollbar, edge fades, arrow buttons
 * that page it and disappear on a touch pointer — is `ScrollRail`. This
 * component had its own copy of that until the category rail needed the
 * same thing and it became the second of three.
 */
export function ReelsRailClient({ reels, vendors }: ReelsRailClientProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const authorNameFor = useCallback(
    (reel: Reel) =>
      (reel.vendorId && vendorNameById.get(reel.vendorId)) || reel.authorLabel || "Homekrafted",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is rebuilt from the same `vendors` prop each render
    [vendors],
  );

  if (reels.length === 0) return null;

  return (
    <>
      {/* The `id` is a stable handle for `e2e/tests/focus-traps.spec.ts`, so
          it can address a reel card without guessing at an accessible name —
          the whole card is the button (`ReelCard`), and its label is the
          reel's own copy. */}
      <ScrollRail label="reels" id="hk-reels-rail" className={styles.rail}>
        {reels.map((reel, index) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            authorName={authorNameFor(reel)}
            onOpen={() => setOpenIndex(index)}
          />
        ))}
      </ScrollRail>

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
