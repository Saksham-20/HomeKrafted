import { findSameName, foldName } from '../../src/common/fold-name';

/**
 * Taxonomy names compare case- and accent-folded (2026-09-16). Production
 * got "Home Décor" and "Home Decor" as two craft shelves because every check
 * used Prisma's `mode: 'insensitive'`, which folds case only.
 */
describe('foldName', () => {
  it('treats an accented and a plain spelling as one name', () => {
    expect(foldName('Home Décor')).toBe(foldName('Home Decor'));
    expect(foldName('Crème brûlée')).toBe('creme brulee');
  });

  it('folds case and runs of whitespace', () => {
    expect(foldName('  HOME   decor ')).toBe('home decor');
  });

  it('does not decide judgement calls: & vs and, plurals, synonyms', () => {
    expect(foldName('Candles & Home')).not.toBe(foldName('Candles and Home'));
    expect(foldName('Pickles')).not.toBe(foldName('Pickle'));
    expect(foldName('Achaar')).not.toBe(foldName('Pickles'));
  });

  it('keeps Devanagari vowel signs, so two different Hindi names stay different', () => {
    expect(foldName('राखी')).toBe('राखी');
    expect(foldName('राखी')).not.toBe(foldName('रखा'));
  });
});

describe('findSameName', () => {
  const rows = [
    { name: 'Home Décor', slug: 'home-decor' },
    { name: 'Crochet', slug: 'crochet' },
  ];

  it('finds the existing row whatever the accents and case', () => {
    expect(findSameName(rows, 'home decor')?.slug).toBe('home-decor');
  });

  it('answers undefined when nothing matches', () => {
    expect(findSameName(rows, 'Ceramics')).toBeUndefined();
  });
});
