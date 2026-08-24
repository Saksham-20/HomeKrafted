export interface InstagramMarkProps {
  /** Rendered size in px, square. */
  size?: number;
  className?: string;
}

/**
 * Instagram's glyph, inline.
 *
 * **Why not `lucide-react`.** Lucide dropped its brand icons at v1 (this
 * repo is on 1.26), and `CLAUDE.md`'s stack note already says the same
 * thing for the other three we need: line icons come from lucide, brand
 * marks are inline SVG (WhatsApp, App Store, Play). This is the fourth.
 *
 * Drawn in `currentColor` at lucide's own 24-unit grid and stroke feel, so
 * it sits beside `<Play>` and `<Heart>` in the reel chrome without looking
 * like a pasted logo. It is a *source label* — "this clip lives on
 * Instagram" — and never a claim of endorsement, which is why nothing here
 * uses their gradient.
 */
export function InstagramMark({ size = 16, className }: InstagramMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
