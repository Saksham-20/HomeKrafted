import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every indexable route declares its own canonical URL.
 *
 * **The bug this exists to catch.** `app/about/page.tsx` hand-rolled a
 * bare `Metadata` object — a title and a description, no `path`. Next
 * therefore emitted no `alternates.canonical` for it, so the page
 * inherited the root layout's, which points at the home page. `/about`
 * was telling every search engine it was a duplicate of `/` and should be
 * dropped in its favour. It was the only public route on the site with a
 * wrong canonical, and nothing on the rendered page shows it.
 *
 * `CLAUDE.md` has said "never hand-roll a `Metadata` object; that's how a
 * page ships a title and no canonical" since M15. It was still missed,
 * which is the argument for a test rather than a rule.
 *
 * The escape hatch is honest rather than absent: a route that declares
 * `robots: { index: false }` has no canonical to get wrong, and several
 * legitimately do — the cart, the wallet, checkout, search, the account
 * shell and the dev-only gallery are all private or per-visitor.
 *
 * Scanned at source, like `seo-titles.spec.ts` and
 * `keyboard-activation.spec.ts` — the client test environment is `node`,
 * with nothing to render into.
 */

const APP_DIR = join(__dirname, "..", "app");

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === "page.tsx" || entry === "layout.tsx") found.push(full);
  }
  return found;
}

describe("a route that can be indexed", () => {
  // The root layout is the one legitimate bare `Metadata`: it defines the
  // site-wide defaults every other route builds on, including the
  // `title.template` and the fallback canonical.
  const files = routeFiles(APP_DIR).filter((f) => f !== join(APP_DIR, "layout.tsx"));

  it("finds route files to check (guards against the scan matching nothing)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("says which URL it is, or says not to index it", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");

      // No metadata at all is fine — the route inherits the layout's, and
      // a nested page under a segment that sets its own is normal.
      const declaresMetadata =
        /export\s+const\s+metadata/.test(source) || /export\s+(async\s+)?function\s+generateMetadata/.test(source);
      if (!declaresMetadata) continue;

      // Built through the helper, which always sets `alternates.canonical`.
      if (/pageMetadata\s*\(/.test(source)) continue;
      // A dynamic route computing its own — those pass through the helper
      // too, and `seo-titles.spec.ts` covers their titles.
      if (/generateMetadata/.test(source) && /pageMetadata\s*\(/.test(source)) continue;
      // Explicitly not for search engines.
      if (/robots:\s*\{[^}]*index:\s*false/.test(source)) continue;
      // Or it sets a canonical by hand, which is unusual but not wrong.
      if (/alternates:\s*\{[^}]*canonical/.test(source)) continue;

      offenders.push(file.replace(join(APP_DIR, ".."), ""));
    }

    expect(offenders).toEqual([]);
  });
});
