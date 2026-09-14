"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import "./scroll-expansion-hero.css";

interface ScrollExpandMediaProps {
  mediaType?: "video" | "image";
  mediaSrc?: string;
  videoSrc?: string;
  posterSrc?: string;
  bgImageSrc: string;
  logoSrc?: string;
  scrollToExpand?: string;
  expandedContent: ReactNode;
}

const ZOOM_COMPLETE = 1.0;
const SCROLL_UNLOCK = 1.6;

export default function ScrollExpandMedia({
  mediaType = "image",
  mediaSrc,
  videoSrc,
  posterSrc,
  bgImageSrc,
  logoSrc,
  scrollToExpand,
  expandedContent,
}: ScrollExpandMediaProps) {
  const isVideo =
    mediaType === "video" ||
    Boolean(videoSrc) ||
    Boolean(mediaSrc && (mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm")));
  const resolvedVideoSrc = videoSrc || (isVideo ? mediaSrc : undefined);

  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const expandedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * Reduced motion skips the zoom entirely rather than merely un-easing it.
   *
   * The CSS floor (`scroll-expansion-hero.css`, `prefers-reduced-motion`)
   * can only reach the transitions; the zoom is an inline `transform` driven
   * from JS and the scroll capture is an event listener, so the media query
   * never touched either. Somebody who asked for less motion was getting the
   * same 5x scale and the same hijacked wheel with the easing removed —
   * strictly worse than the default. Here they land on the expanded split
   * screen with no capture at all, which is the state the page exists to
   * show. Read once, in an effect, because a Server Component cannot ask.
   */
  const [reduceMotion, setReduceMotion] = useState(false);

  const updateProgress = useCallback((val: number) => {
    const next = Math.max(0, Math.min(SCROLL_UNLOCK, val));
    progressRef.current = next;
    setProgress(next);

    const isExpanded = next >= ZOOM_COMPLETE;
    if (isExpanded !== expandedRef.current) {
      expandedRef.current = isExpanded;
      window.dispatchEvent(
        new CustomEvent("hk-hero-state", { detail: { expanded: isExpanded } })
      );
    }
  }, []);

  // Safe video autoplay without re-triggering on every render
  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy or low power mode fallback
      });
    }
  }, [isVideo]);

  // Reduced motion: settle expanded and never capture a gesture.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduceMotion(query.matches);
      if (query.matches) updateProgress(SCROLL_UNLOCK);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [updateProgress]);

  // Robust reload handling: prevent browser scroll restoration from leaving hero in inconsistent state
  useEffect(() => {
    if (typeof window === "undefined") return;
    /*
     * `scrollRestoration` is a property of the whole history object, not of
     * this page — set it and leave it and every later route in the session
     * loses scroll restoration too, so Back from a product page no longer
     * returns a shopper to their place in /shop. Put it back on unmount.
     */
    const previousRestoration =
      "scrollRestoration" in window.history ? window.history.scrollRestoration : undefined;
    if (previousRestoration !== undefined) {
      window.history.scrollRestoration = "manual";
    }
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    queueMicrotask(() => {
      // Asked directly rather than read off `reduceMotion`: this microtask can
      // run before that state has committed, and resetting to 0 here would
      // undo the skip and put the hijack back for exactly the people who
      // asked for no motion.
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        updateProgress(SCROLL_UNLOCK);
      } else if (scrollY <= 5) {
        updateProgress(0);
      } else {
        // If reloaded while scrolled down, keep hero expanded
        updateProgress(SCROLL_UNLOCK);
      }
    });
    return () => {
      if (previousRestoration !== undefined) {
        window.history.scrollRestoration = previousRestoration;
      }
    };
  }, [updateProgress]);

  const animateTo = useCallback((target: number, duration = 450) => {
    const start = progressRef.current;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - t, 3);
      const current = start + (target - start) * ease;
      updateProgress(current);
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [updateProgress]);

  useEffect(() => {
    // Nothing is captured under reduced motion — the split screen is already
    // the state, and the page scrolls the way the browser intended.
    if (reduceMotion) return;

    const handleWheel = (e: globalThis.WheelEvent) => {
      const current = progressRef.current;
      const scrollY = window.scrollY || document.documentElement.scrollTop;

      if (scrollY <= 5) {
        if (e.deltaY > 0) {
          // Scrolling down: advance zoom or leeway until SCROLL_UNLOCK
          if (current < SCROLL_UNLOCK) {
            e.preventDefault();
            const delta = e.deltaY * 0.0016;
            updateProgress(current + delta);
          }
          // Once current >= SCROLL_UNLOCK, do not preventDefault -> page scrolls down
        } else if (e.deltaY < 0) {
          // Scrolling up: if progress > 0, rewind leeway and zoom back out
          if (current > 0) {
            e.preventDefault();
            const delta = e.deltaY * 0.0016;
            updateProgress(current + delta);
          }
        }
      }
    };

    let touchStartY = 0;
    let isTouching = false;

    const handleTouchStart = (e: globalThis.TouchEvent) => {
      if (e.touches.length > 0 && e.touches[0]) {
        touchStartY = e.touches[0].clientY;
        isTouching = true;
      }
    };

    const handleTouchMove = (e: globalThis.TouchEvent) => {
      if (!isTouching || e.touches.length === 0 || !e.touches[0]) return;
      const currentY = e.touches[0].clientY;
      const deltaY = touchStartY - currentY; // positive when dragging up (scrolling down)
      const current = progressRef.current;
      const scrollY = window.scrollY || document.documentElement.scrollTop;

      if (scrollY <= 5) {
        if (deltaY > 0 && current < SCROLL_UNLOCK) {
          if (e.cancelable) e.preventDefault();
          const delta = deltaY * 0.0035;
          updateProgress(current + delta);
          touchStartY = currentY;
        } else if (deltaY < 0 && current > 0) {
          if (e.cancelable) e.preventDefault();
          const delta = deltaY * 0.0035;
          updateProgress(current + delta);
          touchStartY = currentY;
        }
      }
    };

    const handleTouchEnd = () => {
      isTouching = false;
    };

    /**
     * A key press only drives the hero when nothing else wants it.
     *
     * This listener is on `window` and fires for every key pressed anywhere
     * on the page while it is scrolled to the top — which is the whole time
     * somebody is using the header. It swallowed Space, so the search field
     * in the header could not take a space character on the home page: you
     * could type "mango" and "pickle" and never "mango pickle". Arrow keys
     * went the same way for any select or combobox up there.
     *
     * So: never take a key from a field, a control, or anything the author
     * made editable or focusable, and never from a shortcut (a modifier held
     * means the key was meant for the browser or the OS). What is left is a
     * key pressed against the document itself, which is the only case this
     * was ever for.
     */
    const wantsTheKey = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest("input, textarea, select, button, a[href], [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox'], [role='listbox'], [role='dialog'], [tabindex]:not([tabindex='-1'])")) {
        return true;
      }
      return false;
    };

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (scrollY > 5) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (wantsTheKey(e.target)) return;
      const current = progressRef.current;
      if (
        (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") &&
        current < SCROLL_UNLOCK
      ) {
        e.preventDefault();
        updateProgress(Math.min(SCROLL_UNLOCK, current + 0.3));
      } else if ((e.key === "ArrowUp" || e.key === "PageUp") && current > 0) {
        e.preventDefault();
        updateProgress(Math.max(0, current - 0.3));
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateProgress, reduceMotion]);

  const zoomProgress = Math.min(1, progress);
  const cardScale = 1 + zoomProgress * 4.0;
  const logoScale = 1 + zoomProgress * 1.5;
  const logoOpacity =
    zoomProgress < 0.85 ? 1 : Math.max(0, 1 - (zoomProgress - 0.85) / 0.15);
  const stageOpacity =
    progress >= 0.98 ? Math.max(0, (1 - progress) / 0.02) : 1;

  return (
    <div className="scroll-expand-root">
      {/*
        The split screen is in the document from the first paint, and the
        stage above it is what hides it.

        It used to be mounted only at `progress >= 1`, so the server sent a
        home page with no `<h1>` in it at all: the brand lockup, the heading
        and both doors — the entire proposition — existed only after somebody
        scrolled. That cost the page its heading for every crawler and every
        screen reader arriving at the top, and `#hk-hero-brand` (the element
        `HeaderClient` observes to decide when the landing bar turns solid)
        was not there to be observed on load.

        `.scroll-expand-stage` is `inset: 0` over this with an opaque
        background, so occluding it costs nothing visually and the entrance
        rides on `data-expanded` instead of on mounting.
      */}
      <div className="scroll-expand-split" data-expanded={progress >= 1.0 ? "true" : "false"}>
        {expandedContent}
      </div>

      {/* Overlay Stage: Zooming card & logo (visible while zooming in) */}
      {progress < 1.0 && (
        <div className="scroll-expand-stage" style={{ opacity: stageOpacity }}>
          <Image
            src={bgImageSrc}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
            className="scroll-expand-background"
          />
          <div className="scroll-expand-scrim" aria-hidden="true" />
          <div
            className="scroll-expand-card"
            style={{
              transform: `translate3d(-50%, -50%, 0) scale(${cardScale})`,
              borderRadius: `${Math.max(0, 24 * (1 - zoomProgress))}px`,
            }}
            onClick={() => animateTo(1.0)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                animateTo(1.0);
              }
            }}
            role="button"
            tabIndex={0}
            title="Click or scroll to expand"
            aria-label="Click or scroll to explore HomeKrafted"
          >
            {isVideo ? (
              <video
                ref={videoRef}
                className="scroll-expand-card-surface scroll-expand-card-video"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                width={600}
                height={600}
                poster={posterSrc || "/videos/hero-card-neon-poster.jpg"}
                aria-label="HomeKrafted animated neon sign"
              >
                <source src={resolvedVideoSrc || "/videos/hero-card-neon.mp4"} type="video/mp4" />
                <source src="/videos/hero-card-neon.webm" type="video/webm" />
                {/* Fallback image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterSrc || "/videos/hero-card-neon-poster.jpg"}
                  alt="HomeKrafted"
                  className="scroll-expand-card-surface"
                />
              </video>
            ) : mediaSrc ? (
              <Image
                src={mediaSrc}
                alt="HomeKrafted"
                fill
                priority
                sizes="(max-width: 768px) 80vw, 440px"
                className="scroll-expand-card-surface"
              />
            ) : null}
            {logoSrc && (
              <>
                <div className="scroll-expand-card-scrim" aria-hidden="true" />
                <div
                  className="scroll-expand-logo"
                  style={{
                    opacity: logoOpacity,
                    transform: `scale(${logoScale})`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoSrc} alt="HomeKrafted" />
                </div>
              </>
            )}
          </div>

          {zoomProgress < 0.85 && (
            <>
              <button
                type="button"
                className="scroll-expand-hint"
                style={{
                  opacity: Math.max(0, 1 - zoomProgress * 3.5),
                  pointerEvents: zoomProgress < 0.1 ? "auto" : "none",
                }}
                onClick={() => animateTo(1.0)}
                aria-label="Scroll down or tap to explore"
              >
                <span className="scroll-expand-hint-text">
                  {scrollToExpand || "Scroll down to explore • or tap the sign"}
                </span>
                <span className="scroll-expand-hint-icon" aria-hidden="true">
                  <ChevronDown size={14} strokeWidth={2.6} />
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

