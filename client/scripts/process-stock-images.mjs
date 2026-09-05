/**
 * Normalises licensed stock photography into the committed image set.
 *
 * **Provenance and licence.** Inputs are photographs downloaded from
 * Pexels (Pexels License: free commercial use, no attribution owed, no
 * AI-generated images) — every committed output is recorded in
 * `docs/IMAGE-LICENSES.md` with its source URL and photographer. These
 * are stand-ins for the demo catalogue, replaced listing-by-listing as
 * real makers photograph their own work; CLAUDE.md's rule stands —
 * never a generated image, only real photography.
 *
 * **Run once per batch; the output is committed.** Same contract as
 * `build-chef-avatars.mjs`: nothing fetches at build or request time.
 *
 *   node scripts/process-stock-images.mjs <input-dir>
 *   node scripts/process-stock-images.mjs <input-dir> --banner [--focus=0.55]
 *
 * Recipe matches the existing set (`public/images/products/*.jpg` are
 * 1000×1000 JPEG): centre-crop square, resize to 1000px, JPEG q80.
 * sharp strips metadata by default — do NOT add `.withMetadata()`; the
 * strip is the M25 privacy rule applied to our own assets (EXIF GPS in
 * a photograph is a location leak, whoever took it).
 *
 * `--banner` (2026-09-05) is the browse-hero recipe: a 2400×800 strip
 * (3:1) written to `public/images/site/`, because the band behind
 * `/shop` and `/gifts` is ~1440×260 and a square crop of a landscape
 * photograph showed one blurred bowl at 3× zoom. `--focus` is the
 * vertical centre of the crop as a fraction of the source height
 * (default 0.5) — the thali sits in the lower half of its frame, the
 * wrapped boxes in the middle — so the strip is cut where the subject
 * is rather than where the middle is. Landscape sources only; a portrait
 * one cannot fill a 3:1 strip without being mostly one object.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const inDir = args.find((a) => !a.startsWith("--"));
const banner = args.includes("--banner");
const focusArg = args.find((a) => a.startsWith("--focus="));
const focus = focusArg ? Number(focusArg.slice("--focus=".length)) : 0.5;
if (!inDir || !(focus >= 0 && focus <= 1)) {
  console.error(
    "usage: node scripts/process-stock-images.mjs <input-dir> [--banner [--focus=0..1]]",
  );
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "images", banner ? "site" : "products");
const BANNER_W = 2400;
const BANNER_H = 800;

const files = (await readdir(inDir)).filter(
  (f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith("_"),
);

for (const file of files) {
  const name = file.replace(/\.(jpe?g|png|webp)$/i, "");
  const out = path.join(OUT, `${name}.jpg`);
  let image = sharp(path.join(inDir, file)).rotate(); // bake EXIF orientation in BEFORE the strip, or portrait shots store sideways
  if (banner) {
    // Cut the 3:1 strip around `focus`, then resize — sharp's cover
    // positions are edge/centre only, and the subject is rarely there.
    const { width = 0, height = 0 } = await image.metadata();
    const stripH = Math.min(height, Math.round((width * BANNER_H) / BANNER_W));
    const top = Math.max(0, Math.min(height - stripH, Math.round(height * focus - stripH / 2)));
    image = image.extract({ left: 0, top, width, height: stripH }).resize(BANNER_W, BANNER_H);
  } else {
    image = image.resize(1000, 1000, { fit: "cover" });
  }
  const info = await image.jpeg({ quality: 80 }).toFile(out);
  console.log(`  ${name}.jpg ${Math.round(info.size / 1024)}K`);
}
console.log(`\n${files.length} written to ${OUT}`);
