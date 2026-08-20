/**
 * How a HomeKrafter is pictured on a card when they have no photo of
 * their own.
 *
 * `lib/data/vendors.ts` records why the seeded kitchens carry no
 * `avatarSrc` at all (M28): every one of them used to point at
 * `/images/vendors/avatar.jpg`, so ten storefronts rendered the same
 * borrowed face, which on a platform whose entire pitch is that a real
 * person made this reads as fake faster than no face does. The honest
 * answer was the labelled hatch placeholder, and it looks like a missing
 * asset because it is one.
 *
 * This is the third option: a **drawn caricature**, one of six, picked
 * from the kitchen's slug. It is a stand-in and is meant to be replaced
 * — see `ownAvatarSrc` for what displaces it.
 *
 * **Why six and not one.** A single dummy face on every card is exactly
 * the thing M28 deleted, and it would be worse the second time: back
 * then it was a photograph nobody had chosen, now it would be a
 * photograph nobody had chosen *and* a house style implying somebody drew
 * these to order. Six variants means no two kitchens in a four-card rail
 * match.
 *
 * **Why they are line art with no skin tone.** The faces are an outline
 * in the wash's own ink, with the hair filled in the same colour. Nothing
 * here assigns a complexion, an age or a gender to a real named cook,
 * which a shaded portrait would — the drawing says "a person makes this",
 * which is the true part, and stops there.
 *
 * Every function is pure and deterministic. That is not incidental: these
 * render inside a Server Component, so a `Math.random()` pick would
 * choose one face on the server and another during hydration — React
 * #418, the mismatch `CLAUDE.md` records from M12.
 */

/** Three muted washes for the disc behind the drawing. Nothing louder. */
export type MakerTone = "sage" | "sand" | "clay";

/** How many caricatures `MakerPortrait` draws. */
export const CARICATURE_COUNT = 6;

const TONES: MakerTone[] = ["sage", "sand", "clay"];

/** FNV-ish string hash. Small, stable, and the same in both runtimes. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * A stable tone for a stable key (pass the vendor's slug).
 *
 * The point is only that two kitchens next to each other in the grid are
 * unlikely to match — the three washes are close enough that landing on
 * the same one is not a defect.
 */
export function makerTone(key: string): MakerTone {
  return TONES[hashString(key) % TONES.length];
}

/**
 * Which caricature this kitchen gets, as an index.
 *
 * Salted so it does not move in lockstep with `makerTone` — otherwise
 * face and wash would be perfectly correlated and the set would read as
 * three combinations rather than eighteen.
 */
export function makerCaricature(key: string): number {
  return hashString(`${key}#face`) % CARICATURE_COUNT;
}

/**
 * The bundled brand images that were seeded onto every vendor before M28.
 *
 * The seeds stopped setting these, but the rows written before that day
 * still hold them — which is why production currently shows two different
 * kitchens under one stock photograph of the same woman. Reading the
 * field through here means a card draws a caricature for those rows
 * instead of the borrowed face, and an actual upload (`/uploads/…`, or a
 * per-kitchen file dropped under `public/images/vendors/`) still wins.
 *
 * Clearing the column on those rows is the real fix and this guard can go
 * with it; until then it is the difference between the grid being wrong
 * and the grid being right.
 */
const SHARED_STOCK_AVATARS = new Set(["/images/vendors/avatar.jpg"]);

/** A picture that is genuinely this kitchen's, or nothing. */
export function ownAvatarSrc(avatarSrc?: string): string | undefined {
  if (!avatarSrc) return undefined;
  return SHARED_STOCK_AVATARS.has(avatarSrc) ? undefined : avatarSrc;
}
