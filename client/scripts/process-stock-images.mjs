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
 *
 * Recipe matches the existing set (`public/images/products/*.jpg` are
 * 1000×1000 JPEG): centre-crop square, resize to 1000px, JPEG q80.
 * sharp strips metadata by default — do NOT add `.withMetadata()`; the
 * strip is the M25 privacy rule applied to our own assets (EXIF GPS in
 * a photograph is a location leak, whoever took it).
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const inDir = process.argv[2];
if (!inDir) {
  console.error("usage: node scripts/process-stock-images.mjs <input-dir>");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "images", "products");

const files = (await readdir(inDir)).filter(
  (f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith("_"),
);

for (const file of files) {
  const name = file.replace(/\.(jpe?g|png|webp)$/i, "");
  const out = path.join(OUT, `${name}.jpg`);
  const info = await sharp(path.join(inDir, file))
    .rotate() // bake EXIF orientation in BEFORE the strip, or portrait shots store sideways
    .resize(1000, 1000, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toFile(out);
  console.log(`  ${name}.jpg ${Math.round(info.size / 1024)}K`);
}
console.log(`\n${files.length} written to ${OUT}`);
