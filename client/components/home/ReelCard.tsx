"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Heart, Play } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCount } from "@/lib/format";
import type { Reel } from "@/lib/types";
import styles from "./ReelCard.module.css";

export interface ReelCardProps {
  reel: Reel;
  /** Resolved from `Reel.vendorId`; "Homekrafted" for platform-posted reels. */
  authorName: string;
  onOpen: () => void;
}

const MODULE_LABEL: Record<Reel["module"], string> = {
  marketplace: "Marketplace",
  snacks: "Snacks",
  laundry: "Laundry",
};

/** `0:28`, `1:41` — reel runtime chip. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * One 9:16 reel tile in the Home rail. The whole card is a button that
 * opens `<ReelViewer>` — the tile itself only ever plays a muted, looping,
 * controls-less preview, so it never steals audio from the page.
 *
 * The preview auto-plays when the card is at least half in view and pauses
 * when it scrolls out (an always-playing rail of six videos is a real
 * battery/CPU cost on mobile). Reels without `videoSrc` — every seed reel
 * today, see `lib/data/reels.ts` — render as their poster still, which is
 * why the play badge is always drawn rather than only on hover.
 */
export function ReelCard({ reel, authorName, onOpen }: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Honour reduced-motion: no unprompted autoplay, poster only.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Autoplay can still be refused (low power mode); the poster stays up.
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);

    return () => observer.disconnect();
  }, []);

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <span className={styles.frame}>
        {reel.videoSrc ? (
          <video
            ref={videoRef}
            className={styles.video}
            src={reel.videoSrc}
            poster={reel.posterSrc}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={reel.posterPlaceholder}
          />
        ) : (
          <ImageSlot
            ratio="9/16"
            label={reel.posterPlaceholder}
            src={reel.posterSrc}
            className={styles.poster}
          />
        )}

        <span className={styles.scrim} aria-hidden="true" />

        <span className={clsx(styles.chip, styles.moduleChip)}>{MODULE_LABEL[reel.module]}</span>
        <span className={clsx(styles.chip, styles.durationChip)}>
          {formatDuration(reel.durationSeconds)}
        </span>

        <span className={styles.playBadge} aria-hidden="true">
          <Play size={16} strokeWidth={2} fill="currentColor" />
        </span>

        <span className={styles.overlay}>
          <span className={styles.author}>{authorName}</span>
          <span className={styles.title}>{reel.title}</span>
          <span className={styles.stats}>
            <Heart size={12} strokeWidth={2} aria-hidden="true" />
            {formatCount(reel.likeCount)}
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            {formatCount(reel.viewCount)} views
          </span>
        </span>
      </span>
    </button>
  );
}
