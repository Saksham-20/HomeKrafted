/**
 * Whether two taxonomy names are the same name (2026-09-16).
 *
 * Production holds two craft shelves, "Home Décor" (top level) and "Home
 * Decor" (under Candles & Home), because every duplicate check compared
 * names with Prisma's `mode: 'insensitive'`, which folds case and nothing
 * else — and one of the two seeds looked only under the same parent. The
 * slug had already stripped the accent, so the second shelf quietly became
 * `home-decor-2`.
 *
 * Postgres can only fold accents in a query with the `unaccent` extension,
 * which is a migration for a problem that lives in lists of a few hundred
 * rows at most. So callers load the names in scope and compare here.
 *
 * Folds: case, Latin accents (the U+0300–U+036F combining block after NFKD),
 * runs of whitespace. **Not every combining mark**: Devanagari vowel signs
 * are marks too, and stripping them would make "राखी" and "रखा" one name.
 *
 * Deliberately **not** "&" vs "and", plurals or synonyms —
 * "Pickles" and "Pickle" is a judgement an admin makes on the approve form
 * (M50), not something a string function should decide.
 */
export function foldName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first row whose name folds to the same string, if any. */
export function findSameName<T extends { name: string }>(rows: readonly T[], name: string): T | undefined {
  const wanted = foldName(name);
  return rows.find((row) => foldName(row.name) === wanted);
}
