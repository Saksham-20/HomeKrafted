"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Heart, Play } from "lucide-react";
import { InstagramMark } from "@/components/ui/icons/InstagramMark";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCount } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion";
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
    if (prefersReducedMotion()) return;

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

  const fromInstagram = Boolean(reel.instagramUrl);

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <span className={styles.frame}>
        {fromInstagram && !reel.posterSrc ? (
          /*
            An Instagram-hosted reel with no still of our own. The hatch
            placeholder is wrong here — it means "an asset is missing",
            and nothing is missing: the clip is one press away, on
            Instagram's player. Mirroring their poster frame is not the
            fix either (`lib/instagram.ts`: signed URLs that expire, and a
            separate permission from embedding the post).
          */
          <span className={styles.igTile} aria-hidden="true">
            <InstagramMark size={26} />
          </span>
        ) : reel.videoSrc ? (
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
        {/* Instagram publishes no runtime anonymously, so a reel from
            there has `durationSeconds: 0` and gets the source chip
            instead of a fabricated `0:00`. */}
        {reel.durationSeconds > 0 ? (
          <span className={clsx(styles.chip, styles.durationChip)}>
            {formatDuration(reel.durationSeconds)}
          </span>
        ) : (
          fromInstagram && (
            <span className={clsx(styles.chip, styles.durationChip)}>
              <InstagramMark size={11} /> Instagram
            </span>
          )
        )}

        <span className={styles.playBadge} aria-hidden="true">
          <Play size={16} strokeWidth={2} fill="currentColor" />
        </span>

        <span className={styles.overlay}>
          <span className={styles.author}>{authorName}</span>
          <span className={styles.title}>{reel.title}</span>
          {/* Zero counts mean "not published to us", not "nobody watched"
              — Instagram's own live numbers are inside the embed. Printing
              "0 likes · 0 views" under a real creator's clip would be a
              made-up number, and an insulting one. */}
          {reel.viewCount > 0 && (
            <span className={styles.stats}>
              <Heart size={12} strokeWidth={2} aria-hidden="true" />
              {formatCount(reel.likeCount)}
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              {formatCount(reel.viewCount)} views
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
