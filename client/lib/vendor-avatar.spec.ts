import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No screen reads `vendor.avatarSrc` directly.
 *
 * **Why this exists.** Ten seeded storefronts once pointed at one file,
 * `/images/vendors/avatar.jpg` — so two different kitchens rendered under
 * the same stock photograph of the same woman, on a platform whose entire
 * pitch is that a real person made this. M28 stopped the seeds writing
 * it; the rows written before that day still hold it, and nothing has
 * cleared the column. `lib/maker-portrait.ts#ownAvatarSrc` is the filter
 * that turns those rows back into "no picture", and `MakerPortrait` is
 * the component that renders the placeholder instead.
 *
 * The filter only works where it is called. It shipped applied to the
 * home page's maker rail alone, which left the borrowed face rendering on
 * the storefront header, in search results, in the account's following
 * list, and — worst — in the storefront's OpenGraph image and its
 * `LocalBusiness` JSON-LD, i.e. the WhatsApp share card and the thing
 * Google indexes. Four surfaces, all reading the same column, none of
 * them looking wrong.
 *
 * That is a silent failure in the shape `vendor-privacy.spec.ts` and
 * `silent-failure.spec.ts` exist for, so it gets the same treatment: the
 * build fails, naming the file.
 */

const ROOTS = ["app", "components"];

/**
 * Files allowed to touch the column, each for a stated reason. A new
 * entry here is a claim that this file is not a buyer-facing render of
 * one named kitchen.
 */
const ALLOWED: Record<string, string> = {
  "components/vendor/MakerPortrait.tsx":
    "the one component that renders a vendor avatar — it calls ownAvatarSrc itself",
  "components/seller/SellerStorefrontClient.tsx":
    "a HomeKrafter editing their own avatar; the form must show the stored value, stock or not",
  "app/storefront/[vendor]/page.tsx":
    "metadata + JSON-LD, both routed through ownAvatarSrc — asserted separately below",
  "app/gallery/GalleryClient.tsx":
    "dev-only, unlinked: it *constructs* throwaway vendors to show every character, and renders them through MakerPortrait like everything else",
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

/** Comments quote code constantly in this repo; a mention is not a read. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `client/` — this spec lives in `client/lib/`. */
const CLIENT_ROOT = join(__dirname, "..");

describe("vendor avatars — nothing renders the shared stock face", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(CLIENT_ROOT, root))).map((abs) =>
    relative(CLIENT_ROOT, abs),
  );

  it("scans a real population (the tree has not moved under this spec)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("only allowlisted files read avatarSrc", () => {
    const offenders = files.filter((rel) => {
      if (ALLOWED[rel]) return false;
      const source = stripComments(readFileSync(join(CLIENT_ROOT, rel), "utf8"));
      return /\bavatarSrc\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("the allowlist names real files — a rename must be reconciled here", () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect(files).toContain(rel);
    }
  });

  it("the storefront route launders both its metadata image and its JSON-LD image", () => {
    const rel = "app/storefront/[vendor]/page.tsx";
    const source = stripComments(readFileSync(join(CLIENT_ROOT, rel), "utf8"));

    // Every read of the column on this route goes through the filter.
    const reads = source.match(/\bavatarSrc\b/g) ?? [];
    const laundered = source.match(/ownAvatarSrc\(\s*vendor\.avatarSrc\s*\)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(laundered.length).toBe(reads.length);
  });
});
