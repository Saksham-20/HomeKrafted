"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { FOCUSABLE, trapTab } from "@/lib/focus-trap";
import type { ProductImage } from "@/lib/types";
import styles from "./ProductGallery.module.css";

export interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
}

/**
 * Product detail gallery — one large image, a thumbnail row that selects
 * it, and a full-screen viewer.
 *
 * **The thumbnails did nothing until 2026-09-17.** This component drew a
 * main image and up to four thumbnails from the day it shipped, and none
 * of them was a control: no state, no swap, no viewer. Pressing one did
 * nothing, which on a page selling something handmade is the one
 * interaction a buyer reaches for. It went unnoticed because it was also
 * unreachable — every write path stored exactly one `ProductImage`
 * (`server/src/seller/listing-photos.ts`), so the row had no second
 * picture to draw and 34 of 34 products on a dev database had one photo.
 * Both halves are fixed together; either alone is still nothing a buyer
 * can use.
 *
 * Three rules worth keeping:
 *
 * - **A thumbnail is a `<button>`, not a div with an `onClick`.** React's
 *   `onClick` on a div does not fire for Enter or Space, which is the
 *   product-grid bug M22 fixed one component over.
 * - **The viewer honours the whole dialog contract** (CLAUDE.md, M16):
 *   focus in on open, `trapTab` at both ends from the shared module, focus
 *   back to the opener on close, and the page behind scroll-locked.
 *   `aria-modal` without those is a claim the page does not honour —
 *   exactly what `ReelViewer` shipped with until M29.
 * - **One photo means no chrome.** No thumbnail row, no expand hint, no
 *   counter: a gallery's furniture around a single picture reads as
 *   something that failed to load the rest.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const shots: ProductImage[] =
    images.length > 0 ? images : [{ placeholder: productName, ratio: "1/1" }];
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A photo removed in the seller portal can leave `selected` past the end
  // of a shorter list on the next load; clamping beats rendering nothing.
  const index = Math.min(selected, shots.length - 1);
  const current = shots[index];
  const hasMany = shots.length > 1;

  function step(by: number) {
    setSelected((at) => (at + by + shots.length) % shots.length);
  }

  /** Escape closes, ←/→ move between photos, Tab is trapped inside. */
  useEffect(() => {
    if (!viewerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerOpen(false);
        return;
      }
      if (hasMany && event.key === "ArrowRight") step(1);
      if (hasMany && event.key === "ArrowLeft") step(-1);
      trapTab(scrimRef.current, event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // `index` is deliberately not a dependency: moving between photos is a
    // move *within* the open dialog, and `step` reads the latest state
    // through the updater form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen, hasMany, shots.length]);

  useEffect(() => {
    if (!viewerOpen) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    scrimRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [viewerOpen]);

  /**
   * ←/→ across the thumbnail row moves the selection *and* the focus, the
   * way a radio group does — a row of buttons where the arrows do nothing
   * makes a keyboard user press Tab once per photo.
   */
  function onThumbKeyDown(event: React.KeyboardEvent, at: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (at + (event.key === "ArrowRight" ? 1 : -1) + shots.length) % shots.length;
    setSelected(next);
    thumbRefs.current[next]?.focus();
  }

  return (
    <div className={styles.gallery}>
      <div className={styles.mainFrame}>
        {/* The one image on this page worth `priority`: it is the LCP
            element, and lazy-loading it delays the thing the visitor came
            for. The thumbnails below stay lazy. */}
        <ImageSlot
          ratio={current.ratio}
          label={current.placeholder}
          alt={hasMany ? `${productName} — photo ${index + 1} of ${shots.length}` : productName}
          src={current.src}
          sizes="(max-width: 900px) 100vw, 560px"
          priority
        />
        {/* Only offered when there is a photo to enlarge: an expand button
            over the hatched placeholder promises a bigger nothing. */}
        {current.src && (
          <button
            type="button"
            className={styles.expand}
            onClick={() => setViewerOpen(true)}
            aria-label={`View ${productName} larger`}
          >
            <Expand size={15} strokeWidth={1.9} aria-hidden="true" />
            <span className={styles.expandLabel}>View</span>
          </button>
        )}
      </div>

      {hasMany && (
        <div className={styles.thumbRow} role="group" aria-label={`${productName} photos`}>
          {shots.map((thumb, at) => (
            <button
              key={thumb.src ?? at}
              type="button"
              ref={(node) => {
                thumbRefs.current[at] = node;
              }}
              className={clsx(styles.thumb, at === index && styles.thumbActive)}
              // The selected state is what `aria-pressed` is for on a row
              // of toggles; `role="tablist"` on chips is an axe critical
              // (the portal-kit rule) and these are not tabs.
              aria-pressed={at === index}
              onClick={() => setSelected(at)}
              onKeyDown={(event) => onThumbKeyDown(event, at)}
              aria-label={`Show photo ${at + 1} of ${shots.length}`}
            >
              <ImageSlot
                ratio="1/1"
                label={thumb.placeholder}
                alt=""
                src={thumb.src}
                sizes="96px"
                shape="square"
                compact
              />
            </button>
          ))}
        </div>
      )}

      {viewerOpen && (
        <div
          className={styles.scrim}
          ref={scrimRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} photos`}
        >
          {/* Click-to-close behind everything, and out of the tab order so
              the trap's first stop is the close button (the `FOCUSABLE`
              contract — `[tabindex="-1"]` never matches). */}
          <button
            type="button"
            className={styles.scrimHit}
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setViewerOpen(false)}
          />
          <button
            type="button"
            className={styles.close}
            onClick={() => setViewerOpen(false)}
            aria-label="Close photo viewer"
          >
            <X size={20} strokeWidth={1.9} aria-hidden="true" />
          </button>

          <figure className={styles.viewerFigure}>
            <ImageSlot
              ratio={current.ratio}
              label={current.placeholder}
              alt={
                hasMany ? `${productName} — photo ${index + 1} of ${shots.length}` : productName
              }
              src={current.src}
              sizes="(max-width: 900px) 100vw, 900px"
            />
            {hasMany && (
              <figcaption className={styles.counter}>
                {index + 1} / {shots.length}
              </figcaption>
            )}
          </figure>

          {hasMany && (
            <>
              <button
                type="button"
                className={clsx(styles.navButton, styles.prev)}
                onClick={() => step(-1)}
                aria-label="Previous photo"
              >
                <ChevronLeft size={22} strokeWidth={1.9} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={clsx(styles.navButton, styles.next)}
                onClick={() => step(1)}
                aria-label="Next photo"
              >
                <ChevronRight size={22} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
