import Image from "next/image";
import clsx from "clsx";
import styles from "./ImageSlot.module.css";

export type ImageSlotShape = "rect" | "square" | "circle";

export interface ImageSlotProps {
  /** CSS `aspect-ratio` value, e.g. "1/1", "1.5/1", "16/5", "4/5". */
  ratio: string;
  /** Fallback label drawn on the placeholder, e.g. "Mango Thokku Pickle product photo". */
  label: string;
  /**
   * Alt text for the real image (M16). Falls back to `label`, which is
   * how every call site behaved before — but a caller that knows the
   * product name should pass it, because a placeholder caption
   * ("MANGO THOKKU — HERO") is a filename, not a description.
   *
   * Pass `""` for a genuinely decorative image; that is the one case
   * where empty alt is correct rather than lazy.
   */
  alt?: string;
  /** Optional export-size caption, e.g. "1200×1200". */
  size?: string;
  /** "circle" for avatars/category tiles, "square" for small thumbs. */
  shape?: ImageSlotShape;
  /** Smaller, background-less label chip — for dense thumbnail grids. */
  compact?: boolean;
  /** Real asset path — bundled (`/images/...`) or uploaded (`/uploads/...`). */
  src?: string;
  /**
   * `sizes` for the responsive srcset (M16). The default assumes a card
   * in a grid; a full-bleed hero or a small avatar should say so, or the
   * browser downloads a viewport-wide image to fill 88 pixels.
   */
  sizes?: string;
  /**
   * Skip lazy-loading for an image that is part of the LCP — a page's
   * hero, a product's first photo. Never set it on more than one or two
   * images per page: marking everything priority is the same as marking
   * nothing.
   */
  priority?: boolean;
  className?: string;
}

/** A card in a responsive grid — roughly full width on phones, a third of the container on desktop. */
const DEFAULT_SIZES = "(max-width: 640px) 100vw, (max-width: 1180px) 50vw, 380px";

/**
 * Every image on the site renders through here, uploaded or not.
 *
 * **M16 (H7): the real image is `next/image` now.** It was a raw `<img>`,
 * which meant a HomeKrafter's phone photo shipped at whatever resolution
 * their camera produced, in the original format, to every buyer's phone.
 * `fill` is used because the wrapper already owns the aspect ratio (and
 * is `position: relative`), so intrinsic dimensions never have to be
 * known ahead of time — which matters for uploads, where they genuinely
 * aren't.
 *
 * **Accessibility.** With a real image the `<Image>` carries the alt text
 * and the wrapper is a plain `<div>`. Before M16 the wrapper was
 * `role="img"` labelled with the placeholder caption and the real image
 * was `aria-hidden`, so every product photo announced its filename.
 * Without a `src` the wrapper *is* the image — a labelled placeholder —
 * so it keeps `role="img"` there.
 */
export function ImageSlot({
  ratio,
  label,
  alt,
  size,
  shape = "rect",
  compact = false,
  src,
  sizes = DEFAULT_SIZES,
  priority = false,
  className,
}: ImageSlotProps) {
  const wrapperClass = clsx(
    styles.slot,
    src && styles.withImage,
    shape === "circle" && styles.circle,
    shape === "square" && styles.square,
    compact && styles.compact,
    className,
  );

  // `aspectRatio` stays inline — a genuinely dynamic value, which is the
  // exception CLAUDE.md carves out of the no-inline-styles rule.
  if (src) {
    return (
      <div className={wrapperClass} style={{ aspectRatio: ratio }}>
        <Image
          className={styles.image}
          src={src}
          alt={alt ?? label}
          fill
          sizes={sizes}
          priority={priority}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClass} style={{ aspectRatio: ratio }} role="img" aria-label={label}>
      <span className={styles.label}>{label}</span>
      {size ? <span className={styles.size}>{size}</span> : null}
    </div>
  );
}
