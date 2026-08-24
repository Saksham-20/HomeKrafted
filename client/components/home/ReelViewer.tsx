"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, Volume2, VolumeX, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCount } from "@/lib/format";
import { instagramEmbedUrl, instagramPermalink } from "@/lib/instagram";
import { FOCUSABLE, trapTab } from "@/lib/focus-trap";
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
  const scrimRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = index !== null;
  const reel = open ? reels[index] : undefined;

  /**
   * Keys: Escape closes, ←/→ move between reels, Tab stays inside.
   *
   * Separate from the open/close effect below because this one has to see
   * the current `index` — merging them would make every prev/next press
   * re-run the scroll lock and the focus restore, which would bounce focus
   * out of the viewer on each step.
   */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowRight" && index < reels.length - 1) onIndexChange(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      trapTab(scrimRef.current, event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, index, reels.length, onIndexChange, onClose]);

  /**
   * The rest of the dialog contract (CLAUDE.md, M16): move focus in on
   * open, restore it to the opener on close, lock the page behind.
   *
   * This claimed `role="dialog" aria-modal="true"` from the day it shipped
   * and honoured only the scroll lock — focus stayed on the reel card
   * behind it, so a keyboard user opened a full-screen player and then
   * tabbed through the home page underneath it, and on close landed back
   * at the top of the document. The trap in the effect above is the second
   * piece; this is the first and third.
   *
   * Keyed on `open` alone, deliberately. `index` changing is a move
   * *within* the open dialog, not an open or a close.
   */
  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // The first focusable is the close button: the full-bleed
    // click-to-close scrim button carries `tabIndex={-1}`, so `FOCUSABLE`
    // skips it. Landing on "Close reel" is right for a surface whose
    // content is a video that plays on its own.
    scrimRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      // Back to the reel card that opened it, if it is still on the page.
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  // Restart from the top whenever the viewer moves to a different reel.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [index]);

  if (!open || !reel) return null;

  const embedUrl = reel.instagramUrl ? instagramEmbedUrl(reel.instagramUrl) : undefined;
  const permalink = reel.instagramUrl ? instagramPermalink(reel.instagramUrl) : undefined;
  const hasPrev = index > 0;
  const hasNext = index < reels.length - 1;

  return (
    <div
      ref={scrimRef}
      /* A stable id, because the root layout already renders two other
         `aria-modal` dialogs on every consumer page (the mobile drawer and
         the location prompt) and `e2e/tests/focus-traps.spec.ts` needs to
         address exactly one of the three — matching on `[role="dialog"]`
         is a strict-mode violation, not an assertion. */
      id="hk-reel-viewer"
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={reel.title}
    >
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
          {embedUrl ? (
            /*
              Instagram's own player, on Instagram's origin. This is the
              only anonymous way to play a reel we do not host — see
              `lib/instagram.ts`. `key` on the reel id so moving to the
              next one remounts the frame rather than leaving the previous
              clip playing behind a new caption.

              No autoplay: a cross-origin iframe cannot be told to, and
              browsers would refuse an unmuted one anyway. The visitor
              presses play inside the frame, which is also where
              Instagram's own like and view counts live.
            */
            <iframe
              key={reel.id}
              className={styles.embed}
              src={embedUrl}
              title={reel.title}
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              scrolling="no"
            />
          ) : reel.videoSrc ? (
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

          {/* The scrim sits over the player to make the overlaid controls
              legible — but over a cross-origin iframe it would swallow
              every press, including play. */}
          {!embedUrl && <div className={styles.playerScrim} aria-hidden="true" />}

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
          {/* Zero is "not published to us", not "nobody watched" — an
              embedded reel carries Instagram's own live counts inside the
              frame, and printing 0 beside it would be a made-up number. */}
          {reel.viewCount > 0 && (
          <p className={styles.stats}>
            <Heart size={13} strokeWidth={2} aria-hidden="true" />
            {formatCount(reel.likeCount)} likes
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            {formatCount(reel.viewCount)} views
          </p>
          )}
          {permalink && (
            <a
              className={styles.source}
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch on Instagram ↗
            </a>
          )}
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
