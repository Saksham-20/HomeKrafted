import { confidenceOf, proposeShelf, termsFor, type ShelfForMatching } from '../../src/admin/recategorise';

/**
 * G1 §3.5 — the rule that proposes where a listing belongs.
 *
 * What is worth pinning here is not "does it find the candle": it is that
 * the rule stays **dumb enough to audit**. Every proposal carries the words
 * it matched, a listing it cannot place is said out loud rather than
 * skipped, and nothing about this file writes anything — an admin approves
 * each row.
 */
const shelf = (over: Partial<ShelfForMatching> & { name: string }): ShelfForMatching => ({
  id: over.name.toLowerCase().replace(/\W+/g, '-'),
  synonyms: [],
  parentId: null,
  parentName: null,
  ...over,
});

const CANDLES = shelf({ name: 'Candles & Lighting', synonyms: ['candle'] });
const JAR_CANDLES = shelf({
  name: 'Scented Jar Candles',
  synonyms: ['jar candle'],
  parentId: CANDLES.id,
  parentName: CANDLES.name,
});
const BANGLES = shelf({
  name: 'Bangles & Kadas',
  synonyms: ['kada', 'kangan', 'bangle'],
  parentId: 'jewellery',
  parentName: 'Jewellery & Accessories',
});

describe('termsFor', () => {
  it('drops short words from a shelf name — "set", "art" and "oil" match half a catalogue', () => {
    expect(termsFor(shelf({ name: 'Trays & Coasters' }))).toEqual(['trays', 'coasters']);
  });

  it('keeps a short synonym, because an admin typed it deliberately', () => {
    // "kada" and "diya" are four and four letters and are the words buyers
    // actually use; the length floor is about accidental name fragments.
    expect(termsFor(BANGLES)).toContain('kada');
  });

  it('drops words that are true of the whole catalogue', () => {
    // Everything on the gifts side is handmade and is a gift, so neither
    // sorts anything — and one distrusted proposal costs the screen its
    // authority.
    expect(termsFor(shelf({ name: 'Handmade Gifts' }))).toEqual([]);
  });
});

describe('proposeShelf', () => {
  it('matches on the listing name', () => {
    const found = proposeShelf({ id: 'p1', name: 'Brass Kada Set of 2' }, [BANGLES, CANDLES]);
    expect(found?.shelf.id).toBe(BANGLES.id);
    expect(found?.hits).toContain('kada');
  });

  it('reads the description too, not only the name', () => {
    const found = proposeShelf(
      { id: 'p2', name: 'Winter Morning', description: 'A scented jar candle poured in soy wax.' },
      [CANDLES, JAR_CANDLES],
    );
    expect(found?.shelf.id).toBe(JAR_CANDLES.id);
  });

  it('prefers the subcategory when both match equally well', () => {
    // A department is a worse answer than the shelf under it, and a
    // proposal that stops at the department leaves the operator to do the
    // real work by hand. Both match one word here, so only the tie-break
    // decides it.
    const diyas = shelf({
      name: 'Diyas & Tealights',
      synonyms: ['diya'],
      parentId: CANDLES.id,
      parentName: CANDLES.name,
    });
    const found = proposeShelf({ id: 'p3', name: 'Terracotta diya candle' }, [CANDLES, diyas]);
    expect(found?.shelf.id).toBe(diyas.id);
    expect(found?.hits).toEqual(['diya']);
  });

  it('answers null rather than guessing', () => {
    expect(proposeShelf({ id: 'p4', name: 'Mystery Object', description: 'Something nice.' }, [
      CANDLES,
      BANGLES,
    ])).toBeNull();
  });

  it('folds case and accents, so "Home Décor" and "home decor" are one word', () => {
    const decor = shelf({ name: 'Home Décor', synonyms: ['décor'] });
    expect(proposeShelf({ id: 'p5', name: 'HOME DECOR piece' }, [decor])?.hits).toContain('decor');
  });
});

describe('confidenceOf', () => {
  it('is "none" when nothing matched, so the row is shown rather than dropped', () => {
    expect(confidenceOf(null)).toBe('none');
  });

  it('separates one matched word from two', () => {
    expect(confidenceOf({ shelf: BANGLES, hits: ['kada'] })).toBe('low');
    expect(confidenceOf({ shelf: BANGLES, hits: ['kada', 'bangle'] })).toBe('high');
  });
});
