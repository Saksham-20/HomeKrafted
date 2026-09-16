import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
  The shared scanner, never a local regex (2026-09-06) — this repo writes
  route patterns in prose constantly, and each one reads as a block-comment
  opener to the one-liner every spec used to carry. A structural scan that
  fails open is worse than no scan, because it reports success.
*/
import { stripComments } from './strip-comments';

/**
 * G1 — **what a shelf asks is admin-only** (docs/GIFTING-REWORK.md §4).
 *
 * The third of these scans, after `category-admin-only` and
 * `occasion-admin-only`, and it guards the same thing one layer down. A
 * category is shared vocabulary a buyer browses by; an *attribute* is the
 * form every maker on that shelf fills in. A HomeKrafter who could add a
 * question to Jewellery would be writing a question onto somebody else's
 * listing screen, and the drift is worse than the category version: "Metal",
 * "metal type" and "Base material" as three filters splitting one facet,
 * with the counts on the browse page quietly wrong for all of them.
 *
 * So the same shape as M50's suggestions: a maker asks, an admin decides,
 * and the code that mints the row lives in `src/admin/` for exactly this
 * scan to find.
 *
 * **`ProductAttributeValue` is deliberately not covered.** That is one
 * listing's *answer*, and writing it is precisely what a HomeKrafter does
 * when they fill the form — the seller-side operation this whole milestone
 * exists to enable, the same way `productCategory` is exempt from the
 * category scan.
 */

const SERVER_SRC = join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

/**
 * A write to the three *definition* tables — the question, its allowed
 * answers, and which shelf asks it.
 *
 * `productAttributeValue` is absent from the alternation on purpose (see
 * above); it is also why the delegate names are anchored rather than
 * matched loosely, since `attributeValue` is a substring of it.
 */
const ATTRIBUTE_WRITE =
  /[.\s](?:prisma|tx)\.(attributeDefinition|attributeOption|categoryAttribute)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

/** A registry with a reason per entry, so a rename fails the build rather than widening it. */
const ALLOWED_WRITERS: { dir: string; why: string }[] = [
  {
    dir: 'admin',
    why: 'the attribute templates screen — behind the fail-closed /api/v1/admin path rule and an admin scope',
  },
  { dir: 'prisma', why: 'seeds, which run without a request at all' },
];

describe('what a shelf asks is admin-only', () => {
  const files = sourceFiles(SERVER_SRC).map((abs) => relative(SERVER_SRC, abs));

  it('scans a real population (the tree has not moved under this spec)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('nothing outside the admin module writes an attribute definition, option or shelf link', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const top = rel.split('/')[0];
      if (ALLOWED_WRITERS.some((entry) => entry.dir === top)) continue;
      const source = stripComments(readFileSync(join(SERVER_SRC, rel), 'utf8'));
      if (ATTRIBUTE_WRITE.test(source)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the seller module still writes a listing’s own answers, so the guard is not vacuous', () => {
    const listings = stripComments(
      readFileSync(join(SERVER_SRC, 'seller', 'listings.service.ts'), 'utf8'),
    );
    // A maker answering their shelf's questions is the whole milestone …
    expect(listings).toMatch(/productAttributeValue\.(createMany|deleteMany)\b/);
    // … and they may not change what the questions are.
    expect(ATTRIBUTE_WRITE.test(listings)).toBe(false);
  });

  it('the server validates answers itself rather than trusting the form', () => {
    const listings = stripComments(
      readFileSync(join(SERVER_SRC, 'seller', 'listings.service.ts'), 'utf8'),
    );
    // The client mirrors these rules more loosely (the identifier-parser
    // direction); the authority is here. Before G1 there was no server-side
    // definition at all, so a wrong answer could not be refused.
    expect(listings).toMatch(/validateAttributeValues\(/);
  });
});
