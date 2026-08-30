/**
 * The characters a HomeKrafter can pick instead of a photograph.
 *
 * **Why this exists.** A photo of the person who cooked your food is the
 * whole pitch, and `/seller/storefront` has taken one since M14 — but
 * most kitchens do not upload one, and until now the alternative was a
 * portrait *assigned* to them by a hash of their slug. A character
 * somebody chose is a different object from a face somebody was given:
 * it can carry a turban, a hijab, grey hair or none of those, and the
 * kitchen is the one who decided.
 *
 * **A photo still wins.** This is the second-best answer and the screen
 * says so. Nothing here is offered as a substitute for the real thing.
 *
 * **Provenance.** Open Peeps by Pablo Stanley, CC0 1.0 — public domain,
 * no attribution owed, commercial use allowed. The files are built by
 * `scripts/build-chef-avatars.mjs` (which records the whole licence
 * chain) and **committed**; nothing fetches dicebear.com at build time
 * or at request time, and `images.remotePatterns` stays empty.
 *
 * **The stored value is the `.webp` path**, which is why this needs no
 * column of its own: it goes into `Vendor.avatarSrc` like an upload
 * does, so every surface that already renders an avatar renders a
 * character with no change at all — including the storefront's
 * OpenGraph card and its `LocalBusiness` JSON-LD, which point at that
 * same string and cannot take an SVG.
 */

export interface ChefCharacter {
  /** Stable id — the filename, and what the picker keys on. */
  id: string;
  /**
   * What the picker shows and a screen reader reads.
   *
   * It describes the **drawing** and claims nothing about the person
   * choosing it: no names, no ages, no community named on somebody's
   * behalf. A cook who wears a turban can recognise one without being
   * told what it is supposed to mean about them.
   */
  label: string;
  /** The value written to `Vendor.avatarSrc`. */
  src: string;
}

const file = (id: string) => `/images/avatars/${id}.webp`;

/**
 * Sixteen, in the order the picker shows them.
 *
 * The order is deliberate and not alphabetical: the head coverings and
 * the grey hair are not buried at the bottom of the grid, because a set
 * whose first row is six young women with long hair has already told
 * most of the people looking at it that it is not for them.
 *
 * Keep this in step with `CAST` in `scripts/build-chef-avatars.mjs` —
 * that file is what draws them, this one is what offers them.
 */
export const CHEF_CHARACTERS: ChefCharacter[] = [
  { id: "turban-beard", label: "Turban and beard", src: file("turban-beard") },
  { id: "hijab", label: "Hijab", src: file("hijab") },
  { id: "grey-bun", label: "Grey bun", src: file("grey-bun") },
  { id: "grey-moustache", label: "Grey moustache", src: file("grey-moustache") },
  { id: "moustache", label: "Moustache", src: file("moustache") },
  { id: "bun", label: "Hair in a bun", src: file("bun") },
  { id: "full-beard", label: "Full beard", src: file("full-beard") },
  { id: "long-hair", label: "Long hair", src: file("long-hair") },
  { id: "goatee", label: "Goatee", src: file("goatee") },
  { id: "bangs-glasses", label: "Fringe and glasses", src: file("bangs-glasses") },
  { id: "bald-beard", label: "Bald with a beard", src: file("bald-beard") },
  { id: "short-hair", label: "Short hair", src: file("short-hair") },
  { id: "quiff-glasses", label: "Quiff and glasses", src: file("quiff-glasses") },
  { id: "curly-hair", label: "Curly hair", src: file("curly-hair") },
  { id: "crop-moustache", label: "Cropped hair and moustache", src: file("crop-moustache") },
  { id: "bob", label: "Bob and fringe", src: file("bob") },
];

/** Every character's `src`, for the "is this a character or a photo" test. */
const CHARACTER_SRCS = new Set(CHEF_CHARACTERS.map((character) => character.src));

/**
 * Whether a stored `avatarSrc` is one of these characters.
 *
 * The picker needs it to show which one is selected, and the upload
 * control needs it so a character does not render inside a box that
 * says "your photo". Matching on the exact stored string rather than on
 * the directory keeps a future `/images/avatars/` file that is *not* a
 * character from silently counting as one.
 */
export function isChefCharacter(src?: string): boolean {
  return Boolean(src && CHARACTER_SRCS.has(src));
}
