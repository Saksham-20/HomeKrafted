import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No route may put the brand in its own title.
 *
 * `app/layout.tsx` sets `title.template: "%s — Homekrafted"`, so a page
 * that also writes "— Homekrafted" ships it twice. Three had:
 * `/about`, `/search` and the 404 all rendered
 * `<title>… — Homekrafted — Homekrafted</title>` — and a title is the one
 * piece of SEO nobody reviews in a browser, because the tab truncates it
 * and the duplication only shows up in a search result.
 *
 * Asserted over the route files rather than through `pageMetadata`,
 * because the helper cannot see the mistake: the string it is handed is
 * already wrong, and it has no way to tell "Search — Homekrafted" from a
 * page legitimately named after the brand. The only place the rule is
 * checkable is where the titles are written.
 */

const APP_DIR = join(__dirname, "..", "app");
const BRAND_IN_TITLE = /title:\s*(["'`])[^"'`]*—\s*Homekrafted[^"'`]*\1/;

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("route titles", () => {
  const offenders = routeFiles(APP_DIR).filter((file) =>
    BRAND_IN_TITLE.test(readFileSync(file, "utf8")),
  );

  it("never repeat the brand the root layout's template already appends", () => {
    expect(offenders.map((f) => f.slice(f.indexOf("/app/")))).toEqual([]);
  });
});
