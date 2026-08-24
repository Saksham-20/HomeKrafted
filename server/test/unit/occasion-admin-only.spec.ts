import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * An occasion is minted by an admin, and by nobody else.
 *
 * **Why this exists.** M43 made occasions searchable and creatable, and
 * the create affordance is a *prop* on the combobox — passed on the admin
 * screen, withheld on the HomeKrafter's listing form. A prop is not a
 * permission: a withheld one hides a row in a menu and stops there. The
 * thing that actually decides is that the only write route lives under
 * `/api/v1/admin`, where `RolesGuard` is fail-closed.
 *
 * The failure this guards against is somebody later doing the obvious
 * helpful thing — "let a HomeKrafter add the festival they cook for" —
 * which sounds generous and quietly ends the shared vocabulary: "Diwali",
 * "diwali" and "Deepavali" become three hub pages splitting one
 * festival's traffic, with nothing in the product able to merge them.
 *
 * Reads are fine and stay fine: `SellerListingsService` counts occasions
 * to validate the ids on a listing, which is exactly right.
 *
 * **M50 did the generous thing without opening the write.** A HomeKrafter
 * can now ask for an occasion that isn't there — the picker used to say
 * "ask an admin" with no way to. The ask is a `TaxonomySuggestion` row;
 * an admin approving it is what mints the `Occasion`, and that code lives
 * in `src/admin/` for exactly this scan's sake. The last case below pins
 * that the seller-facing controller files an ask and nothing more.
 */

const SERVER_SRC = join(__dirname, '..', '..', 'src');

/**
 * Prose in this repo quotes decorators and Prisma calls constantly. A
 * scan that counts a comment as code fails *open* — that is precisely how
 * `rbac-structure.spec.ts` once reported three ungated controllers as
 * gated.
 */
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
 * A write to the `Occasion` table itself. Deliberately does not match
 * `productOccasion` (capital O in the delegate name) — tagging a listing
 * with an existing occasion is the seller-side operation that must keep
 * working.
 */
const OCCASION_WRITE = /[.\s](?:prisma|tx)\.occasion\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

/**
 * Directories whose code may write the table, each with its reason. This
 * is a registry, not a list: a rename should fail the build rather than
 * silently widen it.
 */
const ALLOWED_WRITERS: { dir: string; why: string }[] = [
  { dir: 'admin', why: 'POST/PATCH /admin/collections/occasions — the admin CMS, behind the fail-closed path rule' },
  { dir: 'prisma', why: 'seeding and migration helpers, which run without a request at all' },
];

describe('occasions are admin-only to create', () => {
  const files = sourceFiles(SERVER_SRC).map((abs) => relative(SERVER_SRC, abs));

  it('scans a real population (the tree has not moved under this spec)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('nothing outside the admin module writes the Occasion table', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const top = rel.split('/')[0];
      if (ALLOWED_WRITERS.some((entry) => entry.dir === top)) continue;
      const source = stripComments(readFileSync(join(SERVER_SRC, rel), 'utf8'));
      if (OCCASION_WRITE.test(source)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the seller module still reads occasions, so the guard is not vacuous', () => {
    const listings = stripComments(
      readFileSync(join(SERVER_SRC, 'seller', 'listings.service.ts'), 'utf8'),
    );
    expect(listings).toMatch(/prisma\.occasion\.count\b/);
    expect(OCCASION_WRITE.test(listings)).toBe(false);
  });

  it('the create route is declared on the admin collections controller', () => {
    const controller = stripComments(
      readFileSync(join(SERVER_SRC, 'admin', 'collections.controller.ts'), 'utf8'),
    );
    expect(controller).toMatch(/@Roles\('admin'\)/);
    expect(controller).toMatch(/@Post\('occasions'\)/);
  });

  /**
   * The M50 escape valve, pinned in the shape it shipped: a controller
   * under `seller/` that takes the ask and touches neither table. If this
   * ever grows a `prisma.occasion.create`, the scan above catches it —
   * this case catches the subtler regression of the ask itself being
   * replaced by a direct write to some other module's service.
   */
  it('the seller-side ask files a suggestion and creates nothing', () => {
    const controller = stripComments(
      readFileSync(join(SERVER_SRC, 'seller', 'taxonomy.controller.ts'), 'utf8'),
    );
    expect(controller).toMatch(/@Roles\('seller'\)/);
    expect(controller).toMatch(/TaxonomySuggestionsService/);
    expect(OCCASION_WRITE.test(controller)).toBe(false);
    expect(controller).not.toMatch(/prisma\.category\.(create|update|upsert|delete)/);
  });

  it('no controller outside admin/ exposes an occasion-creating handler', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (!rel.endsWith('.controller.ts')) continue;
      if (rel.startsWith('admin/')) continue;
      const source = stripComments(readFileSync(join(SERVER_SRC, rel), 'utf8'));
      if (/createOccasion\s*\(/.test(source)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
