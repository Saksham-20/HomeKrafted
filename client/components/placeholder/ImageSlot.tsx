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
  /**
   * Encoder quality, one of `images.qualities` in `next.config.ts`
   * (50 or 75). Leave it alone for anything a buyer is judging; the
   * landing hero passes 50 because a grainy photograph under a scrim
   * does not repay the bytes.
   */
  quality?: 50 | 75;
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
/**
 * **An upload goes through the optimiser now (2026-08-30); an absolute
 * URL still does not.**
 *
 * From M25 until today `/uploads/` was rendered `unoptimized`, because
 * the optimiser resolves a relative `src` against its *own* server
 * (127.0.0.1:3000), nothing on the Next process served that path in
 * production, and the optimiser fetched its own 404 page and answered
 * `400 "The requested resource isn't a valid image"`. The fix is in
 * `next.config.ts`: the `/uploads/` rewrite that already existed for dev
 * now applies in production too, pointed at the public origin, so the
 * optimiser's in-process fetch is answered by nginx from disk like any
 * browser's. What it buys is the thing M25 named as the follow-up: a
 * 260px card no longer downloads the 1600px file a full-width banner
 * needs, and a phone gets AVIF at its own width. The M25 pipeline
 * (2000px cap, WebP, metadata stripped) still runs at upload time; this
 * is the per-slot resize on top of it, cached for a week.
 *
 * **The absolute-URL arm is structural on purpose (M27).** With cloud
 * storage the stored URL becomes absolute
 * (`https://storage.googleapis.com/…`). The obvious implementation —
 * compare against a `NEXT_PUBLIC_UPLOAD_BASE_URL` — would be a build-time
 * inline baked in by `deploy.sh` on the box, so one missing line in the
 * web `.env` makes this return `false`, `next/image` runs its default
 * loader against a deliberately empty `remotePatterns`, and it **throws**
 * `Invalid src prop … hostname is not configured`. Not a broken image: a
 * render error taking out every page carrying a HomeKrafter photo.
 *
 * Since `remotePatterns` is empty by design, "absolute ⇒ we are not
 * optimising it" is simply true, needs no configuration, and cannot be
 * misconfigured.
 */
function isAbsolute(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

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
  quality,
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
          quality={quality}
          unoptimized={isAbsolute(src)}
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
