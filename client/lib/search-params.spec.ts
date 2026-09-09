/**
 * `/search?q=a&q=b` was a 500.
 *
 * A repeated parameter is legal in a URL and Next hands it through as
 * `string[]`. `app/search/page.tsx` declared `{ q?: string }`, narrowed
 * nothing, and passed it to `search()`, which calls `query.trim()` — a
 * TypeError on the one public route whose entire input is a raw URL
 * anybody can construct, share or crawl.
 *
 * The parser lives in the route file, so this asserts the rule against
 * the route's own source rather than importing a Server Component into
 * jest. Two things are checked: that the type admits the array, and that
 * nothing destructures `q` straight out of `searchParams` again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "app", "search", "page.tsx"), "utf8")
  // Comments stripped before scanning — this repo quotes code in prose
  // constantly, and this file's own doc comment shows the shape it bans.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the search route parses its query defensively", () => {
  it("admits a repeated parameter in the type", () => {
    expect(source).toMatch(/q\?:\s*string\s*\|\s*string\[\]/);
  });

  it("never destructures q straight out of searchParams", () => {
    // `const { q = "" } = await searchParams` is the shape that 500'd.
    expect(source).not.toMatch(/\{\s*q\s*(=|,|\})/);
  });

  it("routes it through a narrowing helper", () => {
    expect(source).toMatch(/firstParam\(/);
  });
});
