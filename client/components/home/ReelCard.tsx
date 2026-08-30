"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Heart, Play } from "lucide-react";
import { InstagramMark } from "@/components/ui/icons/InstagramMark";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCount } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion";
import { prefersReducedData } from "@/lib/network";
import type { Reel } from "@/lib/types";
import styles from "./ReelCard.module.css";

export interface ReelCardProps {
  reel: Reel;
  /** Resolved from `Reel.vendorId`; "Homekrafted" for platform-posted reels. */
  authorName: string;
  onOpen: () => void;
}

/** `0:28`, `1:41` — reel runtime chip. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * May a preview move on this device at all? Asked at the moment of the
 * interaction rather than once at mount, so there is no post-mount state
 * for it (and no hydration mismatch — the server renders the same inert
 * `<video preload="none">` the browser does).
 */
function previewsAllowed(): boolean {
  return !prefersReducedMotion() && !prefersReducedData();
}

/** A pointer gets the extra, immediate trigger on top of the observer. */
function hasHover(): boolean {
  return window.matchMedia("(hover: hover)").matches;
}

/**
 * The previews currently allowed to be playing. Module-level on purpose —
 * the cards are siblings that never see each other, and the budget below
 * is a page-wide one.
 */
const playing = new Set<HTMLVideoElement>();

/**
 * How many previews may run at once.
 *
 * A wide rail shows four tiles and a rail with one moving thumbnail in it
 * reads as a bug rather than a design, so a pointer device with room for
 * the rail plays all of them. A phone gets **one**: two 168px cards sit
 * fully in view at a time there, decoders are dearer, and the connection
 * is likelier to be metered. Each preview is the ~300 KB eight-second
 * cut, never the full rendition — four of them is the ceiling this
 * number exists to state out loud.
 */
function previewBudget(): number {
  return hasHover() && window.innerWidth >= 900 ? 4 : 1;
}

/** How far a card's middle is from the middle of the viewport. */
function distanceFromCentre(el: HTMLElement): number {
  const box = el.getBoundingClientRect();
  return Math.abs(box.top + box.height / 2 - window.innerHeight / 2);
}

/**
 * Make room for one more preview, and say whether there is any.
 *
 * The whole rail crosses the observer's threshold in the same frame, so
 * without a budget every card would set its `src` on the way past. **A
 * card that is not going to play must never be given a source**, or the
 * fetch happens anyway and pausing it afterwards saves nothing. When the
 * budget is full the most central card wins, measured live rather than
 * from a stored number, so scrolling hands the slot over cleanly.
 */
function claimSlot(video: HTMLVideoElement): boolean {
  for (const other of playing) {
    if (!other.isConnected || other.paused) playing.delete(other);
  }
  if (playing.has(video)) return true;
  if (playing.size < previewBudget()) return true;

  let furthest: HTMLVideoElement | null = null;
  for (const other of playing) {
    if (!furthest || distanceFromCentre(other) > distanceFromCentre(furthest)) {
      furthest = other;
    }
  }
  if (!furthest || distanceFromCentre(video) >= distanceFromCentre(furthest)) {
    return false;
  }
  furthest.pause();
  playing.delete(furthest);
  return true;
}

/**
 * Attach the source and play. The `<video>` is rendered with **no `src`**:
 * `preload="none"` is honoured by Chrome and Firefox, but Safari has
 * probed media elements with `Range: bytes=0-1` at page load whatever the
 * attribute says, and the only guarantee of zero bytes until somebody asks
 * is for there to be nothing to probe. Set once; a paused card keeps it.
 */
function startPreview(video: HTMLVideoElement, src: string) {
  if (!claimSlot(video)) return;
  playing.add(video);
  if (!video.src) video.src = src;
  // Autoplay can still be refused (low power mode); the poster stays up.
  void video.play().catch(() => undefined);
}

/**
 * One 9:16 reel tile in the Home rail. The whole card is a button that
 * opens `<ReelViewer>` — the tile itself only ever plays a muted, looping,
 * controls-less preview, so it never steals audio from the page.
 *
 * **The poster is the card; the video is a courtesy on top of it (M52).**
 * The still renders through `<ImageSlot>` — `next/image`, sized for a
 * 208px card, lazy — so the rail costs the page a few kilobytes per tile
 * and nothing else. The `<video>` is `preload="none"`, has no `poster`
 * of its own, and is not even mounted until an effect has decided this
 * device should have one; it fetches its first byte when `play()` is
 * called and fades in over the still on `playing`. What plays is
 * `previewSrc` — an eight-second, 360px, silent cut of the clip, about
 * 300 KB — never the full rendition, which is the viewer's.
 *
 * **It plays in view on every device** (owner, 2026-08-29), with hover
 * and focus as a second, immediate trigger where a pointer exists. That
 * reverses M52's "two triggers, never both", and what M52 was actually
 * protecting against survives it: the problem was never the observer, it
 * was *every visible preview fetching at once*. `playingPreview` allows
 * exactly one decoder on the page, so a rail scrolling into view costs
 * one ~300 KB cut whether it is a phone or a desktop — the same as a
 * single hover. The threshold stays at 0.75, so a card half off the edge
 * of the rail never claims the slot from the one somebody is looking at.
 *
 * `prefers-reduced-motion` and Save-Data (`lib/network.ts`)
 * keep the poster only — the `<video>` is still in the DOM, because a
 * `preload="none"` element that is never played fetches nothing, and
 * rendering it conditionally after mount is what the server cannot
 * agree with.
 */
export function ReelCard({ reel, authorName, onOpen }: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showing, setShowing] = useState(false);

  const fromInstagram = Boolean(reel.instagramUrl);
  // The full clip is the fallback so a reel with footage but no cut still
  // moves — at the cost `Reel.previewSrc`'s doc comment records.
  const previewSrc = fromInstagram ? undefined : (reel.previewSrc ?? reel.videoSrc);

  // Every device, pointer or not (owner, 2026-08-29): the card that is
  // mostly on screen plays. See the component doc for what stops this
  // from being M50's "every visible preview fetches at once".
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewSrc || !previewsAllowed()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startPreview(video, previewSrc);
        } else {
          video.pause();
          playing.delete(video);
        }
      },
      // Three quarters, not "mostly": at 0.6 a card half off the edge of
      // the rail qualified and could take a slot from one somebody is
      // actually looking at.
      { threshold: 0.75 },
    );
    observer.observe(video);

    return () => observer.disconnect();
  }, [previewSrc]);

  const onEnter = () => {
    const video = videoRef.current;
    if (!video || !previewSrc || !hasHover() || !previewsAllowed()) return;
    startPreview(video, previewSrc);
  };

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onOpen}
      /* Hover and focus are an *extra*, immediate trigger — there is no
         matching leave handler, because the observer owns stopping a
         preview and a card the pointer has left is usually still on
         screen. Pausing here would blank the rail the moment the mouse
         moved. */
      onPointerEnter={onEnter}
      onFocus={onEnter}
    >
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
        ) : (
          <ImageSlot
            ratio="9/16"
            label={reel.posterPlaceholder}
            alt={reel.posterPlaceholder}
            src={reel.posterSrc}
            // 208px wide on a desktop rail, 168px on a phone — say so, or
            // the browser downloads a viewport-wide still for a thumbnail.
            sizes="(max-width: 640px) 168px, 208px"
            className={styles.poster}
          />
        )}

        {previewSrc && (
          <video
            ref={videoRef}
            className={clsx(styles.video, showing && styles.videoShowing)}
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            // Decorative: the still underneath carries the description and
            // the button's own copy is its accessible name.
            aria-hidden="true"
            tabIndex={-1}
            onPlaying={() => setShowing(true)}
            onPause={() => setShowing(false)}
            onError={() => setShowing(false)}
          />
        )}

        <span className={styles.scrim} aria-hidden="true" />

        {/* The "MARKETPLACE" module chip left in M52 — internal vocabulary
            on a card a buyer reads, and one of its three values was a
            module withdrawn in M19. `Reel.module` still decides nothing
            here; the CTA does. */}
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
              — a creator's own numbers live on their post. Printing
              "0 likes · 0 views" under a real clip would be a made-up
              number, and an insulting one. */}
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
