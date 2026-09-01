import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A `Category` is minted by an admin, and by nobody else (M58).
 *
 * The twin of `occasion-admin-only.spec.ts`, and it exists for the same
 * reason. M58 gave the admin panel a "+" next to categories and
 * subcategories, and gave HomeKrafters a way to *ask* for one. The
 * tempting next step is the generous-sounding one — "let a HomeKrafter
 * add the shelf they need" — which quietly ends the shared vocabulary the
 * whole catalogue browses by: "Pickles", "Pickle" and "Achaar" as three
 * half-empty shelves with nothing in the product able to merge them.
 *
 * The ask is a `TaxonomySuggestion`; an admin approving it is what mints
 * the row, and that code lives in `src/admin/` for exactly this scan.
 *
 * Reads stay fine and must: `SellerListingsService` looks a category up
 * to validate a listing's ids, which is the correct seller-side
 * operation.
 */

const SERVER_SRC = join(__dirname, '..', '..', 'src');

/** Prose here quotes Prisma calls constantly; a scan that counts a comment as code fails *open*. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

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
 * A write to the `Category` table itself.
 *
 * Deliberately does **not** match `productCategory` (capital C in the
 * delegate name) — filing a listing onto an existing shelf is the
 * seller-side operation M58 is entirely about, and it must keep working.
 */
const CATEGORY_WRITE = /[.\s](?:prisma|tx)\.category\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

/** A registry, not a list: a rename should fail the build rather than silently widen it. */
const ALLOWED_WRITERS: { dir: string; why: string }[] = [
  { dir: 'admin', why: 'POST/PATCH /admin/collections/categories + suggestion approval — behind the fail-closed admin path rule' },
  { dir: 'prisma', why: 'seeding and migration helpers, which run without a request at all' },
];

describe('categories are admin-only to create', () => {
  const files = sourceFiles(SERVER_SRC).map((abs) => relative(SERVER_SRC, abs));

  it('scans a real population (the tree has not moved under this spec)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('nothing outside the admin module writes the Category table', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const top = rel.split('/')[0];
      if (ALLOWED_WRITERS.some((entry) => entry.dir === top)) continue;
      const source = stripComments(readFileSync(join(SERVER_SRC, rel), 'utf8'));
      if (CATEGORY_WRITE.test(source)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the seller module still reads and links categories, so the guard is not vacuous', () => {
    const listings = stripComments(readFileSync(join(SERVER_SRC, 'seller', 'listings.service.ts'), 'utf8'));
    // Reads a category to validate a listing's ids …
    expect(listings).toMatch(/prisma\.category\.(findUnique|count)\b/);
    // … and writes the *join*, which is the whole point of M58 …
    expect(listings).toMatch(/productCategory\.(createMany|deleteMany)\b/);
    // … but never the table itself.
    expect(CATEGORY_WRITE.test(listings)).toBe(false);
  });

  it('the create route is declared on the admin collections controller', () => {
    const controller = stripComments(readFileSync(join(SERVER_SRC, 'admin', 'collections.controller.ts'), 'utf8'));
    expect(controller).toMatch(/@Roles\('admin'\)/);
    expect(controller).toMatch(/@Post\('categories'\)/);
    expect(controller).toMatch(/@Patch\('categories\/:id'\)/);
  });

  it('the seller-side ask files a suggestion and creates nothing', () => {
    const controller = stripComments(readFileSync(join(SERVER_SRC, 'seller', 'taxonomy.controller.ts'), 'utf8'));
    expect(controller).toMatch(/@Roles\('seller'\)/);
    expect(controller).toMatch(/TaxonomySuggestionsService/);
    expect(CATEGORY_WRITE.test(controller)).toBe(false);
  });
});
