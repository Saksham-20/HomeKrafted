/**
 * G1 — where a listing probably belongs (docs/GIFTING-REWORK.md §3.5).
 *
 * **Pure, and it proposes rather than decides.** Nothing here writes: the
 * admin screen shows what this returns and a person approves each row.
 * That is the M36 rule applied to the catalogue — a guess written onto a
 * real storefront looks authoritative, and "a script did it" is not
 * something a maker can argue with.
 *
 * The matching is deliberately dumb: the listing's name and description
 * against each shelf's name and its `synonyms`, which is what synonyms
 * exist for. A dumb rule an operator can audit beats a clever one they
 * cannot — every proposal carries the words that matched, so a wrong one is
 * obvious at a glance rather than needing this file re-read.
 *
 * One definition, two callers: this module backs both the admin screen and
 * `prisma/propose-recategorisation.ts`. A second copy would drift, and the
 * CSV an operator reviewed offline would stop matching the screen they
 * approve it on.
 */

export interface ShelfForMatching {
  id: string;
  name: string;
  synonyms: string[];
  parentId: string | null;
  parentName?: string | null;
}

export interface ListingForMatching {
  id: string;
  name: string;
  description?: string | null;
}

export interface Proposal {
  shelf: ShelfForMatching;
  /** The words that matched — shown on every row, never summarised away. */
  hits: string[];
}

/** Fold case and Latin accents, exactly as `common/fold-name.ts` does. */
function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Words too general to mean anything on this catalogue.
 *
 * "Gift" is on every listing by definition, and "home" is in four shelf
 * names. A term that matches half the catalogue produces proposals nobody
 * trusts, and one distrusted proposal costs the whole screen its authority.
 */
const STOP_WORDS = new Set(['gift', 'gifts', 'home', 'handmade', 'sets', 'and']);

/**
 * The words that stand for a shelf.
 *
 * Its own name split into words of four letters or more — "set", "art" and
 * "oil" each match far too much — plus every synonym, which may be shorter
 * because an admin typed it deliberately ("kada", "diya").
 */
export function termsFor(shelf: ShelfForMatching): string[] {
  const fromName = fold(shelf.name)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  const fromSynonyms = shelf.synonyms
    .map((word) => fold(word))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return Array.from(new Set([...fromName, ...fromSynonyms]));
}

/**
 * The best shelf for a listing, or `null` when nothing matched.
 *
 * **Subcategories win ties**: "Diyas & Tealights" is a better answer than
 * "Candles & Lighting" above it, and a proposal that stops at the
 * department leaves the operator to do the real work by hand.
 */
export function proposeShelf(
  listing: ListingForMatching,
  shelves: readonly ShelfForMatching[],
): Proposal | null {
  const haystack = fold(`${listing.name} ${listing.description ?? ''}`);
  let best: Proposal | null = null;

  for (const shelf of shelves) {
    const hits = termsFor(shelf).filter((term) => haystack.includes(term));
    if (hits.length === 0) continue;

    if (
      !best ||
      hits.length > best.hits.length ||
      // Same number of matched words: prefer the more specific shelf.
      (hits.length === best.hits.length && shelf.parentId !== null && best.shelf.parentId === null)
    ) {
      best = { shelf, hits };
    }
  }

  return best;
}

/** How much an operator should trust a proposal, in one word. */
export function confidenceOf(proposal: Proposal | null): 'none' | 'low' | 'high' {
  if (!proposal) return 'none';
  return proposal.hits.length >= 2 ? 'high' : 'low';
}
