/**
 * Builds the choosable HomeKrafter character set.
 *
 * **Provenance and licence.** The faces are Open Peeps by Pablo Stanley
 * (https://www.openpeeps.com/), **CC0 1.0** — public domain, no
 * attribution required, commercial use allowed. They are composed here
 * through DiceBear's Open Peeps sprite package, whose *code* is MIT
 * (Florian Körner) and whose *design* files carry Open Peeps' CC0. That
 * is why the output can be committed to this repo and served from our
 * own origin with nothing owed to anybody.
 *
 * **Run once; the output is committed.** Nothing at build time or at
 * request time talks to dicebear.com — `images.remotePatterns` is empty
 * on purpose (see CLAUDE.md) and this must not be the thing that widens
 * it. Re-run the script only to change the cast.
 *
 *   node --experimental-strip-types scripts/build-chef-avatars.mjs
 *   (plain `node scripts/build-chef-avatars.mjs` is enough — no TS here)
 *
 * **Why WebP as well as SVG.** `next/image` refuses SVG unless
 * `dangerouslyAllowSVG` is set, and the storefront's OpenGraph card and
 * its `LocalBusiness` JSON-LD both point at whatever `avatarSrc` holds —
 * an SVG there is a broken share card. The raster is what gets stored;
 * the SVG is kept beside it as the editable source.
 *
 * **Every parameter is explicit.** Nothing is left to the seed: a seeded
 * pick would hand every character sunglasses (the default accessory
 * probability is not zero — that is exactly what the first contact sheet
 * came back with) and one skin tone for the whole cast.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const API = "https://api.dicebear.com/9.x/open-peeps/svg";
const OUT = path.join(process.cwd(), "public", "images", "avatars");

/**
 * Shared across the cast, and each one is load-bearing:
 *
 * - `accessoriesProbability=0` — the default is not zero, and a cast
 *   where everybody wears sunglasses reads as a stock illustration pack.
 *   The two characters that *do* wear glasses ask for them by name.
 * - `clothingColor` / `headContrastColor` — Open Peeps ships bright blue
 *   and pink. Both are replaced with the site's own sand and near-black
 *   ink, or the rail looks like somebody pasted in a different product.
 * - `face` and `facialHair` are named per character rather than seeded,
 *   so the cast is a cast and not sixteen rolls of a die.
 */
const BASE = "clothingColor=e8dcc3&headContrastColor=241a12";

/**
 * Six skin tones, spread deliberately across the cast rather than left
 * to a seed. The point of the set is that a kitchen can find somebody
 * who looks like them; one tone for sixteen characters fails that on its
 * own.
 */
const SKIN = ["e0b48d", "d8a077", "c58a5f", "a9714a", "8d5a35", "7a4a2b"];

/**
 * The cast. `label` is what the picker shows and what a screen reader
 * reads, so it describes the drawing plainly and claims nothing about
 * the person choosing it — no names, no ages, no communities named for
 * them. A cook who wears a turban can recognise one; the label does not
 * tell them what it means.
 */
const CAST = [
  { id: "turban-beard", label: "Turban and beard", skin: 2, q: "head=turban&facialHair=full2&facialHairProbability=100&face=smile" },
  { id: "hijab", label: "Hijab", skin: 1, q: "head=hijab&face=smile" },
  { id: "bun", label: "Hair in a bun", skin: 3, q: "head=bun&face=smile" },
  { id: "grey-bun", label: "Grey bun", skin: 0, q: "head=grayBun&face=old" },
  { id: "long-hair", label: "Long hair", skin: 4, q: "head=long&face=cheeky" },
  { id: "bangs-glasses", label: "Fringe and glasses", skin: 1, q: "head=bangs&accessories=glasses&accessoriesProbability=100&face=smile" },
  { id: "short-hair", label: "Short hair", skin: 2, q: "head=medium1&face=smile" },
  { id: "curly-hair", label: "Curly hair", skin: 5, q: "head=longCurly&face=smileBig" },
  { id: "moustache", label: "Moustache", skin: 3, q: "head=short1&facialHair=moustache3&facialHairProbability=100&face=smile" },
  { id: "goatee", label: "Goatee", skin: 0, q: "head=short2&facialHair=goatee1&facialHairProbability=100&face=calm" },
  { id: "full-beard", label: "Full beard", skin: 4, q: "head=shaved1&facialHair=full&facialHairProbability=100&face=smile" },
  { id: "grey-moustache", label: "Grey moustache", skin: 1, q: "head=grayShort&facialHair=moustache7&facialHairProbability=100&face=old" },
  { id: "bald-beard", label: "Bald with a beard", skin: 5, q: "head=noHair1&facialHair=full4&facialHairProbability=100&face=calm" },
  { id: "quiff-glasses", label: "Quiff and glasses", skin: 2, q: "head=pomp&accessories=glasses3&accessoriesProbability=100&face=smile" },
  { id: "bob", label: "Bob and fringe", skin: 3, q: "head=mediumBangs&face=lovingGrin1" },
  { id: "crop-moustache", label: "Cropped hair and moustache", skin: 0, q: "head=short3&facialHair=moustache8&facialHairProbability=100&face=serious" },
];

/**
 * The disc behind the drawing, in the site's own wash. Open Peeps is cut
 * off at the shoulders, so on a card it needs a ground of its own or it
 * floats — and the disc is what makes it a portrait rather than a
 * sticker. `--hk-sand-2`'s value, hardcoded because this file writes
 * pixels and cannot read a CSS custom property.
 */
const DISC = "#F3EEE4";

async function render({ id, skin, q }) {
  // The accessory probability is a *default*, so it is only added for
  // the characters that do not name an accessory themselves — repeating
  // the parameter is a 400, not a last-one-wins.
  const glasses = q.includes("accessories=") ? "" : "accessoriesProbability=0&";
  const url = `${API}?seed=hk&${BASE}&${glasses}skinColor=${SKIN[skin]}&${q}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id}: ${res.status} ${await res.text()}`);
  const svg = await res.text();

  await writeFile(path.join(OUT, `${id}.svg`), svg, "utf8");

  // 512 is two of the largest slot this is used in (a 200px storefront
  // header on a 2× screen) and small enough that sixteen of them are a
  // rounding error in the repo.
  const size = 512;
  const face = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const disc = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${DISC}"/></svg>`,
  );
  await sharp(disc)
    .composite([{ input: face }])
    .webp({ quality: 88 })
    .toFile(path.join(OUT, `${id}.webp`));

  return id;
}

await mkdir(OUT, { recursive: true });
for (const character of CAST) {
  process.stdout.write(`${await render(character)} `);
}
console.log(`\n${CAST.length} characters → public/images/avatars/`);
