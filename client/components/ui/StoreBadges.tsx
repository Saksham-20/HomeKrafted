import clsx from "clsx";
import styles from "./StoreBadges.module.css";

export interface StoreBadgesProps {
  /** "outline" = on-dark bordered pair (Home food-delivery card). "solid" = dark filled pair (QR panel). */
  variant?: "outline" | "solid";
  appStoreHref?: string;
  playStoreHref?: string;
  className?: string;
}

/** Apple glyph, ported verbatim from the prototype — never recolor. */
function AppleGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.05 12.5c0-1.7.9-3 2.3-3.8-.8-1.1-2-1.8-3.5-1.9-1.5-.1-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.7 2.5 3 2.5 1.2-.1 1.7-.8 3.1-.8 1.5 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.4.5-.8.9-1.6 1.2-2.5-3.2-1.2-3.5-4.7-2.5-6.6z" />
    </svg>
  );
}

/** Google Play glyph, ported verbatim from the prototype — never recolor. */
function PlayGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 3l13 9L4 21z" opacity=".9" />
    </svg>
  );
}

/**
 * App Store / Google Play badges — inline SVG brand glyphs ported from
 * the prototype, always rendered as a pair (every prototype instance
 * shows them together). Two variants: "outline" (on the dark food-delivery
 * promo card) and "solid" (the "Get the app" QR panel).
 */
export function StoreBadges({
  variant = "outline",
  appStoreHref = "#",
  playStoreHref = "#",
  className,
}: StoreBadgesProps) {
  return (
    <div className={clsx(styles.row, className)}>
      <a href={appStoreHref} className={clsx(styles.badge, styles[variant])}>
        <AppleGlyph />
        App Store
      </a>
      <a href={playStoreHref} className={clsx(styles.badge, styles[variant])}>
        <PlayGlyph />
        Google Play
      </a>
    </div>
  );
}
