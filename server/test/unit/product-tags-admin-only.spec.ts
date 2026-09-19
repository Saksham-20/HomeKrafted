import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from './strip-comments';

/**
 * A listing's badges — Bestseller, New, Festive, Curated — are an admin's
 * to set, and nobody else's (owner, 2026-09-19).
 *
 * The behaviour is pinned in `featured-merchandising.e2e-spec.ts`; this is
 * the structural half, in the shape of `category-admin-only.spec.ts` and
 * for the same reason. The tempting future edit is the generous one — "the
 * HomeKrafter's form has a tags field again, just wire `dto.tags` through"
 * — and a seller-written `tags:` in a `product.create` looks exactly like
 * the line it replaces. The DTO still *accepts* `tags` from a seller (a
 * removed field would 400 every shipped client), so nothing at the
 * validation layer would notice.
 *
 * Two facts are scanned:
 *
 * 1. **The seller write path decides through `listing-tags.ts`**, never
 *    by reading `dto.tags` itself.
 * 2. **No other file writes `tags` onto a product.** A new service that
 *    creates listings (an import, a bulk tool) would otherwise bypass the
 *    rule by not using `SellerListingsService` at all.
 *
 * Comments are stripped with the shared scanner, and the allowlist is a
 * registry with a reason per entry, so a rename fails the build rather
 * than silently widening it.
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

const read = (rel: string) => stripComments(readFileSync(join(SERVER_SRC, rel), 'utf8'));

const PRODUCT_WRITE = /\.product\.(create|createMany|update|updateMany|upsert)\b/;
const TAGS_KEY = /\btags\s*:/;

/** A registry, not a list. */
const ALLOWED_TAG_WRITERS: { file: string; why: string }[] = [
  {
    file: 'seller/listings.service.ts',
    why: 'the one owner of product writes (M44); its `tags` value comes from listing-tags.ts, asserted below',
  },
];

describe('product badges are admin-only to set', () => {
  const files = sourceFiles(SERVER_SRC).map((abs) => relative(SERVER_SRC, abs));

  it('scans a real population (the tree has not moved under this spec)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('the listing service writes tags only through the actor-aware helpers', () => {
    const source = read('seller/listings.service.ts');

    expect(source).toMatch(/tags:\s*tagsForCreate\(dto\.tags,\s*options\)/);
    expect(source).toMatch(/tags:\s*tagsForUpdate\(dto\.tags,\s*options\)/);
    // The two lines above are the only places `dto.tags` may appear.
    expect(source.match(/dto\.tags/g)).toHaveLength(2);
  });

  it('the helpers are what decide, and they ask who is writing', () => {
    const source = read('seller/listing-tags.ts');
    expect(source.match(/options\.actor === 'admin'/g)).toHaveLength(2);
  });

  it('no other file writes `tags` onto a product', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (ALLOWED_TAG_WRITERS.some((entry) => entry.file === rel)) continue;
      const source = read(rel);
      if (PRODUCT_WRITE.test(source) && TAGS_KEY.test(source)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('nothing in the HomeKrafter module names the featured flag or its rank', () => {
    // `featured` and `featuredRank` are admin merchandising too. No seller
    // DTO carries either today, which is what keeps `forbidNonWhitelisted`
    // turning a seller's attempt into a 400 — the moment one is added to
    // `CreateListingDto` (which the admin routes also extend) a HomeKrafter
    // could feature their own listing.
    const offenders = files
      .filter((rel) => rel.startsWith('seller/'))
      .filter((rel) => /\bfeatured(?:Rank)?\b/.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it('the writer registry is not vacuous: the listing service really does write tags', () => {
    const source = read('seller/listings.service.ts');
    expect(PRODUCT_WRITE.test(source)).toBe(true);
    expect(TAGS_KEY.test(source)).toBe(true);
  });
});
