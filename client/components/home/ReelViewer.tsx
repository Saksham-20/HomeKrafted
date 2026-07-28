"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, Volume2, VolumeX, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCount } from "@/lib/format";
import type { Reel } from "@/lib/types";
import styles from "./ReelViewer.module.css";

export interface ReelViewerProps {
  reels: Reel[];
  /** Index into `reels`; the viewer is closed when null. */
  index: number | null;
  authorNameFor: (reel: Reel) => string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Full-screen reel player — one 9:16 clip at a time with prev/next, the
 * only place a reel plays with sound (muted by default, per browser
 * autoplay policy and basic manners; the toggle is sticky for the session
 * via `muted` state living here rather than per-reel).
 *
 * Reels without `videoSrc` show the poster plus a "clip coming soon" line
 * instead of a dead player — the caption and the product CTA are the point
 * of the screen either way. Escape closes, ←/→ move between reels; the
 * scrim is click-to-close and the page behind is scroll-locked, matching
 * `<MobileDrawer>`.
 */
export function ReelViewer({
  reels,
  index,
  authorNameFor,
  onIndexChange,
  onClose,
}: ReelViewerProps) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const open = index !== null;
  const reel = open ? reels[index] : undefined;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < reels.length - 1) onIndexChange(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, index, reels.length, onIndexChange, onClose]);

  // Restart from the top whenever the viewer moves to a different reel.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [index]);

  if (!open || !reel) return null;

  const hasPrev = index > 0;
  const hasNext = index < reels.length - 1;

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label={reel.title}>
      <button
        type="button"
        className={styles.scrimHit}
        onClick={onClose}
        aria-label="Close reel"
        tabIndex={-1}
      />

      <button type="button" className={styles.close} onClick={onClose} aria-label="Close reel">
        <X size={20} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        className={styles.navPrev}
        onClick={() => onIndexChange(index - 1)}
        disabled={!hasPrev}
        aria-label="Previous reel"
      >
        <ChevronLeft size={22} strokeWidth={1.8} />
      </button>

      <div className={styles.stage}>
        <div className={styles.player}>
          {reel.videoSrc ? (
            <video
              ref={videoRef}
              key={reel.id}
              className={styles.video}
              src={reel.videoSrc}
              poster={reel.posterSrc}
              muted={muted}
              loop
              autoPlay
              playsInline
              controls={false}
              aria-label={reel.posterPlaceholder}
            />
          ) : (
            <>
              <ImageSlot
                ratio="9/16"
                label={reel.posterPlaceholder}
                src={reel.posterSrc}
                className={styles.poster}
              />
              <p className={styles.pending}>Clip coming soon — filming with the maker this week.</p>
            </>
          )}

          <div className={styles.playerScrim} aria-hidden="true" />

          {reel.videoSrc && (
            <button
              type="button"
              className={styles.mute}
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Unmute reel" : "Mute reel"}
            >
              {muted ? (
                <VolumeX size={16} strokeWidth={1.8} />
              ) : (
                <Volume2 size={16} strokeWidth={1.8} />
              )}
            </button>
          )}
        </div>

        <div className={styles.meta}>
          <span className={styles.author}>{authorNameFor(reel)}</span>
          <h3 className={styles.title}>{reel.title}</h3>
          <p className={styles.caption}>{reel.caption}</p>
          <p className={styles.stats}>
            <Heart size={13} strokeWidth={2} aria-hidden="true" />
            {formatCount(reel.likeCount)} likes
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            {formatCount(reel.viewCount)} views
          </p>
          <Link href={reel.ctaHref} className={styles.cta} onClick={onClose}>
            {reel.ctaLabel} →
          </Link>
          <span className={styles.counter}>
            {index + 1} / {reels.length}
          </span>
        </div>
      </div>

      <button
        type="button"
        className={styles.navNext}
        onClick={() => onIndexChange(index + 1)}
        disabled={!hasNext}
        aria-label="Next reel"
      >
        <ChevronRight size={22} strokeWidth={1.8} />
      </button>
    </div>
  );
}
