import type { ReactNode } from "react";

/**
 * The hand-drawn icon set for occasion and category tiles (M33, owner
 * brief).
 *
 * **Why these are hand-authored SVG and not photos or `lucide-react`.**
 * Two tile rows on the home page had nothing to show. Occasion tiles
 * rendered `Occasion.initial` in a gold ring — eight circles reading
 * "A B B C D H T W", which is a placeholder that shipped, not a design:
 * two of the eight collided on "B" and none of them told you anything.
 * The category row was worse: the four craft categories (`candles-home`,
 * `handmade-jewellery`, `art-prints`, `personalised-gifts`) carry no
 * photograph, so `ImageSlot` fell back to its diagonal-hatch placeholder —
 * near-invisible on the canvas, with a 10px grey caption inside a 120px
 * circle.
 *
 * A photo was not available and must not be invented: `CLAUDE.md` forbids
 * generating or AI-fabricating product imagery, and a stock candle is a
 * product shot for a product nobody on the platform is selling. `lucide`
 * would have worked mechanically, but its line icons are a UI-chrome
 * vocabulary — the same weight and personality as the header's cart and
 * search glyphs — and these tiles are the shopfront. Two-tone pine + gold
 * marks read as illustration at 40px and are the one place gold does real
 * work as a fill rather than a border.
 *
 * **Gold here is a stroke/fill, never text.** That is the token rule
 * (`CLAUDE.md`) and it is why `--hk-gold` is used directly rather than
 * `--hk-gold-text-sm`: nothing in this file is a word.
 *
 * **Every lookup falls back.** Occasions and categories are both
 * admin-editable (`/admin/collections/occasions`), so a slug added next
 * week has no art here. `occasionIcon`/`categoryIcon` return `undefined`
 * for an unknown slug and each caller renders its own fallback — a letter
 * ring for an occasion, a wrapped-gift mark for a category. A new
 * occasion must never render an empty box.
 */

/** Shared geometry. 32×32 so the paths below can be read as whole numbers. */
const VIEW_BOX = "0 0 32 32";

/** Main stroke — inherits from the tile, which sets `color: var(--hk-pine)`. */
const INK = "currentColor";

/**
 * Accent stroke/fill — the flame, the gem, the ribbon.
 *
 * `--hk-gold` on the white tiles it was drawn for (3.2:1, comfortably
 * over the 3.0 non-text floor), but **overridable per surface**, because
 * gold does not clear that floor on every ground: on the pine tint behind
 * a category mark it measures 2.85:1. `CategoryTile` sets
 * `--hk-craft-accent` to the darkened `--hk-gold-text-sm` (4.63:1 there)
 * rather than every icon hardcoding one value that has to be wrong
 * somewhere.
 *
 * These marks are `aria-hidden` and always sit directly above their own
 * label, so no icon is the sole carrier of meaning — but "there is text
 * underneath" is a reason the contrast rule is not *violated*, not a
 * reason to draw something nobody can make out.
 */
const GOLD = "var(--hk-craft-accent, var(--hk-gold))";

export interface CraftIconProps {
  /** The art to draw. */
  art: ReactNode;
  /** Rendered pixel size. Tiles use 40; the collections hub uses 34. */
  size?: number;
  className?: string;
}

/**
 * Wrapper that owns the shared SVG attributes so each piece of art below
 * is only its own paths.
 *
 * `aria-hidden` unconditionally: every tile using these renders the
 * occasion or category name as real text immediately after, so announcing
 * the mark would read the label twice.
 */
export function CraftIcon({ art, size = 40, className }: CraftIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      stroke={INK}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Occasions
// ---------------------------------------------------------------------------

const anniversary = (
  <>
    <circle cx="12.5" cy="20" r="6.4" />
    <circle cx="20.5" cy="20" r="6.4" stroke={GOLD} />
    <path
      d="M16 11.4c-2-1.4-2.8-2.3-2.8-3.3a1.7 1.7 0 0 1 2.8-1 1.7 1.7 0 0 1 2.8 1c0 1-.8 1.9-2.8 3.3Z"
      fill={GOLD}
      stroke={GOLD}
    />
  </>
);

const babyShower = (
  <>
    <path d="M6 17a10 10 0 0 1 20 0Z" />
    <path d="M6 17h20a7 7 0 0 1-7 7h-6a7 7 0 0 1-7-7Z" stroke={GOLD} />
    <path d="M26 17V8" />
    <circle cx="12" cy="26" r="2" />
    <circle cx="21" cy="26" r="2" />
  </>
);

const birthday = (
  <>
    <path d="M7 26v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
    <path d="M7 21.2c2.4 0 2.4 1.9 4.8 1.9s2.4-1.9 4.8-1.9 2.4 1.9 4.8 1.9 2.4-1.9 3.6-1.9" stroke={GOLD} />
    <path d="M16 17v-4" />
    <path d="M16 5.5c2.2 2.5 3.3 4.2 3.3 5.7a3.3 3.3 0 0 1-6.6 0c0-1.5 1.1-3.2 3.3-5.7Z" fill={GOLD} stroke={GOLD} />
    <path d="M4.5 26h23" />
  </>
);

const corporate = (
  <>
    <rect x="5" y="11" width="22" height="15" rx="2.5" />
    <path d="M12 11V9.5A2.5 2.5 0 0 1 14.5 7h3A2.5 2.5 0 0 1 20 9.5V11" />
    <path d="M5 17.5h22" stroke={GOLD} />
    <rect x="13.5" y="15.4" width="5" height="4.2" rx="1.2" stroke={GOLD} />
  </>
);

const diwali = (
  <>
    <path d="M4.5 19h23c0 4.5-5.1 7.2-11.5 7.2S4.5 23.5 4.5 19Z" />
    <path d="M16 6.5c3 3.4 4.5 5.8 4.5 7.9a4.5 4.5 0 0 1-9 0c0-2.1 1.5-4.5 4.5-7.9Z" fill={GOLD} stroke={GOLD} />
    <path d="M7.5 14.5 5 12.8" />
    <path d="M24.5 14.5 27 12.8" />
  </>
);

const housewarming = (
  <>
    <path d="M5 15.5 16 6l11 9.5" />
    <path d="M8 13.7V26h16V13.7" />
    <path
      d="M16 23.5c-3.2-2.2-4.4-3.9-4.4-5.4a2.5 2.5 0 0 1 4.4-1.4 2.5 2.5 0 0 1 4.4 1.4c0 1.5-1.2 3.2-4.4 5.4Z"
      fill={GOLD}
      stroke={GOLD}
    />
  </>
);

const thankYou = (
  <>
    <rect x="4.5" y="8.5" width="23" height="16" rx="2.5" />
    <path d="M5.6 10 16 18l10.4-8" />
    <path
      d="M16 24.2c-2.7-1.8-3.7-3.1-3.7-4.3a2.1 2.1 0 0 1 3.7-1.2 2.1 2.1 0 0 1 3.7 1.2c0 1.2-1 2.5-3.7 4.3Z"
      fill={GOLD}
      stroke={GOLD}
    />
  </>
);

const wedding = (
  <>
    <path d="M13 26.5c-5.6-3.8-7.5-6.7-7.5-9.3a4.3 4.3 0 0 1 7.5-2.4 4.3 4.3 0 0 1 7.5 2.4c0 2.6-1.9 5.5-7.5 9.3Z" />
    <path
      d="M21 22.3c-4.6-3.1-6.2-5.5-6.2-7.6a3.6 3.6 0 0 1 6.2-2 3.6 3.6 0 0 1 6.2 2c0 2.1-1.6 4.5-6.2 7.6Z"
      stroke={GOLD}
    />
  </>
);

const rakshaBandhan = (
  <>
    <circle cx="16" cy="16" r="3.8" stroke={GOLD} />
    <circle cx="22.2" cy="16" r="2.7" />
    <circle cx="19.1" cy="10.6" r="2.7" />
    <circle cx="12.9" cy="10.6" r="2.7" />
    <circle cx="9.8" cy="16" r="2.7" />
    <circle cx="12.9" cy="21.4" r="2.7" />
    <circle cx="19.1" cy="21.4" r="2.7" />
    <path d="M2.5 16H7" />
    <path d="M25 16h4.5" />
  </>
);

const karwaChauth = (
  <>
    <g transform="translate(1.5 3) scale(0.84)">
      <path d="M28 17.05A12 12 0 1 1 14.95 4 9.33 9.33 0 0 0 28 17.05Z" />
    </g>
    <path d="M26 5.4c.45 2 .65 2.2 2.6 2.6-1.95.4-2.15.6-2.6 2.6-.45-2-.65-2.2-2.6-2.6 1.95-.4 2.15-.6 2.6-2.6Z" fill={GOLD} stroke={GOLD} />
  </>
);

/** Also the fallback for a category with no art — a wrapped gift reads for anything on this marketplace. */
const gift = (
  <>
    <path d="M6 14.5v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-10" />
    <rect x="4" y="10.5" width="24" height="4.5" rx="1.5" stroke={GOLD} />
    <path d="M16 10.5v16" stroke={GOLD} />
    <path d="M16 10.5c-1.3-3.5-3.3-4.8-5.2-4.4-2.4.5-2.5 3.6.4 4.4Z" />
    <path d="M16 10.5c1.3-3.5 3.3-4.8 5.2-4.4 2.4.5 2.5 3.6-.4 4.4Z" />
  </>
);

// ---------------------------------------------------------------------------
// Categories without a photograph
// ---------------------------------------------------------------------------

const candles = (
  <>
    <rect x="10.5" y="13" width="11" height="14" rx="2" />
    <path d="M16 13v-1.6" />
    <path d="M16 3.6c2.2 2.5 3.3 4.2 3.3 5.7a3.3 3.3 0 0 1-6.6 0c0-1.5 1.1-3.2 3.3-5.7Z" fill={GOLD} stroke={GOLD} />
    <path d="M6.5 27h19" />
  </>
);

const jewellery = (
  <>
    <circle cx="16" cy="20" r="7" />
    <path d="M11.8 11.2 16 5.2l4.2 6-4.2 3.2Z" fill={GOLD} stroke={GOLD} />
  </>
);

const artPrints = (
  <>
    <rect x="4.5" y="6.5" width="23" height="19" rx="2.5" />
    <path d="M6.6 21.6 12.5 15l4.2 4.2 3.8-3.7 5 5.2" />
    <circle cx="21" cy="12" r="2.4" stroke={GOLD} />
  </>
);

const personalised = (
  <>
    <path d="M17.6 4.5H25A2.5 2.5 0 0 1 27.5 7v7.4a2.5 2.5 0 0 1-.73 1.77l-10.6 10.6a2.5 2.5 0 0 1-3.54 0l-8.4-8.4a2.5 2.5 0 0 1 0-3.54l10.6-10.6a2.5 2.5 0 0 1 1.77-.73Z" />
    <circle cx="22" cy="10" r="2" fill={GOLD} stroke={GOLD} />
  </>
);

// ---------------------------------------------------------------------------
// Slug → art. Both maps are open: an unknown slug returns `undefined`.
// ---------------------------------------------------------------------------

const OCCASION_ART: Record<string, ReactNode> = {
  anniversary,
  "baby-shower": babyShower,
  birthday,
  corporate,
  diwali,
  housewarming,
  "thank-you": thankYou,
  wedding,
  "raksha-bandhan": rakshaBandhan,
  "karwa-chauth": karwaChauth,
};

const CATEGORY_ART: Record<string, ReactNode> = {
  "candles-home": candles,
  "handmade-jewellery": jewellery,
  "art-prints": artPrints,
  "personalised-gifts": personalised,
  hampers: gift,
};

/** Art for a known occasion slug, or `undefined` — the caller falls back to the initial. */
export function occasionArt(slug: string): ReactNode | undefined {
  return OCCASION_ART[slug];
}

/** Art for a known category slug, or `undefined` — the caller falls back to `giftArt`. */
export function categoryArt(slug: string): ReactNode | undefined {
  return CATEGORY_ART[slug];
}

/** The generic mark, for a category slug nothing else covers. */
export const giftArt = gift;
