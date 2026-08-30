/**
 * How a HomeKrafter is pictured on a card, and the one string that must
 * never be trusted.
 *
 * `lib/data/vendors.ts` records why the seeded kitchens carry no
 * `avatarSrc` at all (M28): every one of them used to point at
 * `/images/vendors/avatar.jpg`, so ten storefronts rendered the same
 * borrowed face, which on a platform whose entire pitch is that a real
 * person made this reads as fake faster than no face does.
 *
 * **The drawn caricature that used to fill the gap is gone** (owner,
 * 2026-08-29). Ten line-art faces were assigned by hashing the slug, so
 * a kitchen that had never opened the portal still had a portrait — one
 * nobody chose. `/seller/storefront` now offers sixteen characters to
 * pick from (`lib/avatars/chef-characters.ts`), and against a real
 * choice an assigned face is the wrong trade twice over: it is an
 * invention on a page claiming a real person made this, and it hid the
 * gap from the only people who can close it. What is left is the
 * labelled hatch placeholder, which looks like a missing asset because
 * it is one.
 *
 * What survives here is `ownAvatarSrc`, and it is not cosmetic: the
 * pre-M28 rows still hold that shared photograph, and this is the only
 * thing standing between it and four surfaces that would render it as a
 * named kitchen's own face.
 */

/**
 * The bundled brand images that were seeded onto every vendor before M28.
 *
 * The seeds stopped setting these, but the rows written before that day
 * still hold them — which is why production currently shows two different
 * kitchens under one stock photograph of the same woman. Reading the
 * field through here means those rows fall back to the placeholder
 * instead of the borrowed face; a real upload (`/uploads/…`, or a
 * per-kitchen file under `public/images/vendors/`) and a chosen
 * character both still win.
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
