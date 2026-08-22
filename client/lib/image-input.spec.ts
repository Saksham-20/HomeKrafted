import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No screen asks a human to type where an image lives.
 *
 * **Why this exists.** Every image in the product has gone through
 * `ImageUpload` / `PhotoUpload` since M14, except one: the collection
 * editor kept a text input labelled **"Cover image path"**, placeholder
 * `/images/products/…`. It asked an operator to know the server's folder
 * layout, to type it without a typo, and gave them no way to see whether
 * they had. It survived four milestones of image work because nothing
 * failed — a wrong path renders the hatch placeholder, which looks like a
 * missing asset rather than a mistyped field.
 *
 * This scans for the shape of that mistake: a text input bound to a
 * state or field whose name is about an image. It cannot catch every
 * variant, and it is not trying to — it catches the one that shipped, so
 * the next one has to be written deliberately.
 */

const ROOTS = ["app", "components"];
const CLIENT_ROOT = join(__dirname, "..");

/** Field names that mean "an image", in the naming this codebase uses. */
const IMAGE_FIELD = /\b(imageSrc|imageUrl|bannerSrc|avatarSrc|coverImage|photoUrl|imagePath)\b/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * A `<input …>` element whose props mention an image field.
 *
 * Deliberately ignores `<ImageUpload>` and `<PhotoUpload>`, which take a
 * `value={imageSrc}` legitimately — they are the components this rule
 * exists to route people towards.
 */
function imagePathTextInputs(source: string): string[] {
  const hits: string[] = [];
  const inputTag = /<input\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = inputTag.exec(source)) !== null) {
    const tag = match[0];
    if (!IMAGE_FIELD.test(tag)) continue;
    // A file picker is the correct way to accept an image.
    if (/type\s*=\s*"file"/.test(tag)) continue;
    hits.push(tag.replace(/\s+/g, " ").slice(0, 120));
  }
  return hits;
}

describe("image inputs — uploaded, never typed", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(CLIENT_ROOT, root))).map((abs) =>
    relative(CLIENT_ROOT, abs),
  );

  it("scans a real population (the tree has not moved under this spec)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no text input is bound to an image field", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const source = stripComments(readFileSync(join(CLIENT_ROOT, rel), "utf8"));
      for (const tag of imagePathTextInputs(source)) offenders.push(`${rel} :: ${tag}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the collection editor uploads its cover rather than accepting a path", () => {
    const raw = readFileSync(
      join(CLIENT_ROOT, "components/admin/CollectionEditorClient.tsx"),
      "utf8",
    );
    expect(raw).toMatch(/<ImageUpload/);
    // Comments stripped first. The file's own comment explains what the
    // field used to say, and a scan that counts prose as code fails —
    // here noisily, and in `rbac-structure.spec.ts` it failed *open*.
    expect(stripComments(raw)).not.toMatch(/Cover image path/);
  });
});
