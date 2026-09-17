/**
 * A stable ground/ink pair for a category tile, department tile or chip
 * mark (2026-09-17 UI refinement, D2 — "add a little colour").
 *
 * **Why a hash of the id, not a stored field.** A `Category.tint` column
 * would be one more admin decision on a screen that already asks for a
 * name, an icon and a parent — and the four pairs below are drawn from
 * tokens that already exist (`--hk-pine-tint`, `--hk-saffron-tint`,
 * `--hk-terracotta-tint`, `--hk-gold-tint`), each already AA-checked
 * against its own ink in `tokens.extend.css`. Hashing the id is
 * deterministic — the same category always gets the same pair, on the
 * server and in the browser — which is what the M12 React #418 lesson
 * (never derive something during render that the server and the client
 * could disagree on) requires of anything computed rather than stored.
 * A `Math.random()` or `Date.now()`-seeded pick would hydrate-mismatch on
 * every load.
 *
 * **Only four pairs, on purpose.** More hues would read as decoration
 * competing with the icon; this is colour used to tell shelves apart at a
 * glance, not a rainbow. Gold is deliberately absent — `--hk-gold` never
 * carries text (M34), and `--hk-gold-tint` paired with `--hk-gold-text-sm`
 * reads too close to the wallet chip's established meaning to reuse here
 * without confusion, so it stays out of the rotation.
 */
export interface CategoryTint {
  /** Background — a light, named tint token. */
  ground: string;
  /** Foreground — the ink token already measured AA-safe on that tint. */
  ink: string;
}

const CATEGORY_TINTS: readonly CategoryTint[] = [
  { ground: "var(--hk-pine-tint)", ink: "var(--hk-pine)" },
  { ground: "var(--hk-saffron-tint)", ink: "var(--hk-saffron-deep)" },
  { ground: "var(--hk-terracotta-tint)", ink: "var(--hk-terracotta-text)" },
  { ground: "var(--hk-success-tint)", ink: "var(--hk-success)" },
];

/** Small, stable string hash — not cryptographic, just deterministic. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** The ground/ink pair for a category, department or chip — by its id. */
export function categoryTint(id: string): CategoryTint {
  return CATEGORY_TINTS[hashString(id) % CATEGORY_TINTS.length];
}
