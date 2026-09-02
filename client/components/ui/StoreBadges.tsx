import clsx from "clsx";
import styles from "./StoreBadges.module.css";

export interface StoreBadgesProps {
  /** "outline" = on-dark bordered pair (Home food-delivery card). "solid" = dark filled pair (QR panel). */
  variant?: "outline" | "solid";
  appStoreHref?: string;
  playStoreHref?: string;
  className?: string;
}

/** The Apple mark (owner, 2026-09-02: "original logos") — the real
 * bitten-apple-with-leaf shape, monochrome via currentColor, which is
 * Apple's own badge treatment. Never recolor beyond currentColor. */
function AppleGlyph() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

/** The Google Play mark (owner, 2026-09-02: "original logos") — the
 * four-colour prism in Google's own flat palette. Brand colours are the
 * mark; never flatten it back to currentColor. */
function PlayGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M4 2.5c-.02.15-.03.3-.03.46v18.08c0 .16.01.31.03.46.06.36.24.66.5.83L15 12 4.5 1.67c-.26.17-.44.47-.5.83z"
      />
      <path
        fill="#34A853"
        d="M4.5 1.67c.2-.13.47-.14.72 0L18.5 8.99 15 12 4.5 1.67z"
      />
      <path
        fill="#FBBC04"
        d="M15 12l3.5-3.01 3.02 1.66c1.04.57 1.04 2.13 0 2.7L18.5 15 15 12z"
      />
      <path
        fill="#EA4335"
        d="M15 12l3.5 3.01-13.28 7.31c-.25.14-.52.13-.72 0L15 12z"
      />
    </svg>
  );
}

/**
 * App Store / Google Play badges — inline SVG brand glyphs ported from
 * the prototype, always rendered as a pair (every prototype instance
 * shows them together). Two variants: "outline" (on the dark food-delivery
 * promo card) and "solid" (the "Get the app" QR panel).
 *
 * **A missing href renders a badge, not a link, and that is the point.**
 * Both props defaulted to `"#"`, so on the home page, `/app-promo` and
 * the gallery these were three pairs of links that scrolled the page to
 * the top and did nothing else — the shape of a broken promise, since the
 * apps are not published yet. A link is a claim that there is somewhere
 * to go. Until there is, this is a label: same badge, no pointer, no tab
 * stop, and a screen reader is told it is coming rather than being handed
 * a link to nowhere.
 */
export function StoreBadges({
  variant = "outline",
  appStoreHref,
  playStoreHref,
  className,
}: StoreBadgesProps) {
  return (
    <div className={clsx(styles.row, className)}>
      <StoreBadge
        href={appStoreHref}
        variant={variant}
        label="App Store"
        lead="Download on the"
      >
        <AppleGlyph />
      </StoreBadge>
      <StoreBadge href={playStoreHref} variant={variant} label="Google Play" lead="Get it on">
        <PlayGlyph />
      </StoreBadge>
    </div>
  );
}

/**
 * The standard two-line store badge (M56, owner: "make the coming soon
 * pop better with enlarged logos"): a big glyph beside a small lead line
 * over the store name at size. Pending swaps the lead for "Coming soon
 * on the" — the state changes the words, never the shape, so the row
 * reads the same before and after launch.
 */
function StoreBadge({
  href,
  variant,
  label,
  lead,
  children,
}: {
  href?: string;
  variant: "outline" | "solid";
  label: string;
  lead: string;
  children: React.ReactNode;
}) {
  const className = clsx(styles.badge, styles[variant]);
  const body = (
    <>
      {children}
      <span className={styles.lines}>
        <span className={styles.lead}>{href ? lead : "Coming soon on"}</span>
        <span className={styles.store}>{label}</span>
      </span>
    </>
  );

  if (!href) {
    return <span className={clsx(className, styles.pending)}>{body}</span>;
  }

  return (
    <a href={href} className={className}>
      {body}
    </a>
  );
}
