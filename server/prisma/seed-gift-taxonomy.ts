/**
 * G1 — the gift department tree (docs/GIFTING-REWORK.md §3.1).
 *
 * Top level is **what the thing is**. Nothing here is a recipient, an
 * occasion, a price band or "handmade" — everything on the gifts side is
 * handmade, so a "Handmade Gifts" shelf sorts nothing. Recipient and
 * occasion are facets (D1), which is why they are absent from this file.
 *
 * **Additive, idempotent, and it never renames or re-files anything.**
 * Same contract as `seed-subcategories.ts`: safe on production, safe to
 * re-run. Two rules make that true while still reaching the target tree:
 *
 * - **A department adopts the live shelf it replaces.** "Jewellery &
 *   Accessories" is what "Handmade Jewellery" becomes, so the seed finds
 *   that row through `formerly` and files the new subcategories under
 *   **it** rather than minting a second department beside it. The rename
 *   itself is left to the admin-approved data pass (§3.5) — a seed that
 *   renamed a live shelf would be deciding something a person is supposed
 *   to approve, and it would do it to a name that is in shared URLs.
 * - **Enrichment only fills blanks.** `description` and `synonyms` are
 *   written where the row has none, never over an admin's words.
 *
 * `icon` is deliberately left alone: the committed Iconify catalogue and
 * the registry an admin picks from land with G3 (§6), and writing an id
 * now that no icon set has been checked against is the "17 tiles show the
 * same basket" failure with a different spelling.
 *
 * Kitchen & Dining is seeded ahead of any supply on purpose — it is hidden
 * on the buyer page until something is filed under it (D2), so an empty
 * department costs nothing and gives a maker somewhere to list.
 *
 *   npx ts-node prisma/seed-gift-taxonomy.ts
 */
import { PrismaClient, ProductKind } from '@prisma/client';
import { findSameName } from '../src/common/fold-name';

const prisma = new PrismaClient();

interface Department {
  name: string;
  /** Names this department already goes by on the live catalogue, if any. */
  formerly?: string[];
  description: string;
  synonyms: string[];
  children: { name: string; synonyms?: string[] }[];
}

/**
 * The tree. Sized for ~90 gifts growing to a few thousand (Baymard): a
 * subcategory under ~15 listings is met as a prefiltered chip rather than a
 * page, and one past ~30 is a candidate to become a department of its own.
 */
const DEPARTMENTS: Department[] = [
  {
    name: 'Jewellery & Accessories',
    formerly: ['Handmade Jewellery'],
    description: 'Handmade bangles, earrings, necklaces and the small things worn with them.',
    synonyms: ['jewelry', 'jewellery', 'accessories'],
    children: [
      { name: 'Bangles & Kadas', synonyms: ['kada', 'kangan', 'bangle'] },
      { name: 'Earrings', synonyms: ['jhumka', 'jhumki', 'studs'] },
      { name: 'Necklaces & Sets', synonyms: ['haar', 'pendant', 'choker'] },
      { name: 'Bracelets & Anklets', synonyms: ['payal', 'rakhi bracelet'] },
      { name: 'Rings', synonyms: ['anguthi'] },
      { name: 'Hair Accessories', synonyms: ['scrunchie', 'clip', 'hairband'] },
      { name: 'Potlis & Pouches', synonyms: ['potli', 'batua'] },
    ],
  },
  {
    name: 'Candles & Lighting',
    formerly: ['Candles & Home'],
    description: 'Poured, shaped and scented candles, and the holders they sit in.',
    synonyms: ['candle', 'mombatti'],
    children: [
      { name: 'Scented Jar Candles', synonyms: ['jar candle'] },
      { name: 'Shaped & Festive Candles', synonyms: ['modak candle', 'ladoo candle'] },
      { name: 'Diyas & Tealights', synonyms: ['diya', 'deepak', 'tealight'] },
      { name: 'Holders & Lanterns', synonyms: ['urli', 'lantern', 'candle holder'] },
    ],
  },
  {
    name: 'Wall Art',
    formerly: ['Art & Prints'],
    description: 'Original paintings, miniatures and prints by independent artists.',
    synonyms: ['painting', 'art', 'wall decor'],
    children: [
      { name: 'Original Paintings', synonyms: ['canvas', 'acrylic painting'] },
      { name: 'Miniatures', synonyms: ['miniature painting', 'pichwai'] },
      { name: 'Prints & Posters', synonyms: ['print', 'poster'] },
      { name: 'Custom Portraits', synonyms: ['portrait', 'custom print'] },
    ],
  },
  {
    name: 'Home Décor',
    description: 'Resin art, showpieces, torans and the things that make a room a home.',
    synonyms: ['home decor', 'decor', 'showpiece'],
    children: [
      { name: 'Resin Art', synonyms: ['resin'] },
      { name: 'Showpieces & Figurines', synonyms: ['showpiece', 'murti', 'figurine'] },
      { name: 'Vases & Planters', synonyms: ['vase', 'planter', 'gamla'] },
      { name: 'Torans & Wall Hangings', synonyms: ['toran', 'bandhanwar', 'wall hanging'] },
      { name: 'Pooja & Festive Décor', synonyms: ['pooja', 'puja', 'thali', 'asan', 'shagun', 'chunri'] },
    ],
  },
  {
    name: 'Bath & Self-care',
    formerly: ['Self-Care'],
    description: 'Small-batch soaps, balms and skin care made by hand.',
    synonyms: ['self care', 'skincare', 'bath'],
    children: [
      { name: 'Face Care', synonyms: ['face mask', 'ubtan', 'face wash'] },
      { name: 'Hair Care', synonyms: ['hair oil', 'shampoo'] },
      { name: 'Soaps & Bath', synonyms: ['soap', 'bath bomb'] },
      { name: 'Balms & Oils', synonyms: ['balm', 'body oil'] },
    ],
  },
  {
    name: 'Kids & Soft Toys',
    description: 'Crocheted toys, keepsakes and things made for a child’s room.',
    synonyms: ['kids', 'toys', 'baby'],
    children: [
      { name: 'Amigurumi & Soft Toys', synonyms: ['amigurumi', 'crochet toy', 'teddy'] },
      { name: 'Baby Keepsakes', synonyms: ['keepsake', 'newborn'] },
      { name: "Kids' Room Décor", synonyms: ['nursery decor'] },
    ],
  },
  {
    name: 'Flowers & Plants',
    description: 'Crocheted and preserved flowers that outlast a bouquet, and plants.',
    synonyms: ['flowers', 'bouquet', 'plants'],
    children: [
      { name: 'Crochet & Forever Flowers', synonyms: ['crochet bouquet', 'forever flowers'] },
      { name: 'Dried & Preserved', synonyms: ['dried flowers', 'preserved'] },
      { name: 'Plants', synonyms: ['plant', 'succulent'] },
    ],
  },
  {
    name: 'Hampers & Gift Sets',
    description: 'Ready-assembled boxes a maker puts together and prices themselves.',
    synonyms: ['hamper', 'gift box', 'gift set'],
    children: [
      { name: 'Festive Hampers', synonyms: ['diwali hamper', 'rakhi hamper'] },
      { name: 'Self-care Sets', synonyms: ['pamper box'] },
      { name: 'Mixed Hampers', synonyms: ['assorted hamper'] },
    ],
  },
  {
    /**
     * D10, owner 2026-09-16: chocolates stay on the gifts side rather than
     * moving to `food`, which would have taken fourteen live listings off
     * sale while `foodOrdersOpen` is off. The department asks the food
     * questions all the same (veg mark, allergens, shelf life, FSSAI —
     * `seed-gift-attributes.ts`), and a courier carries one of these only
     * when the maker has marked it packed heat-safe
     * (`Product.heatSafePacked`, read by `courier-eligibility.ts`).
     */
    name: 'Chocolates & Edible Gifts',
    description: 'Chocolates, bakes and sweets made to be given — with the food questions asked.',
    synonyms: ['chocolate', 'edible', 'sweets', 'mithai', 'cookies'],
    children: [
      { name: 'Chocolates', synonyms: ['bonbon', 'truffle'] },
      { name: 'Cookies & Tins', synonyms: ['cookie', 'biscuit'] },
      { name: 'Mithai', synonyms: ['mithai', 'barfi', 'ladoo'] },
      { name: 'Jars & Preserves', synonyms: ['pickle', 'achaar', 'jam'] },
    ],
  },
  {
    name: 'Kitchen & Dining',
    description: 'Mugs, serveware and table pieces made by hand.',
    synonyms: ['kitchen', 'dining', 'tableware'],
    children: [
      { name: 'Mugs', synonyms: ['mug', 'cup'] },
      { name: 'Serveware', synonyms: ['platter', 'bowl'] },
      { name: 'Trays & Coasters', synonyms: ['tray', 'coaster'] },
    ],
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function freeSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 50; i += 1) {
    const taken = await prisma.category.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error(`Could not derive a free slug from "${base}"`);
}

/**
 * Fill `description`/`synonyms` where the row has none. Never overwrites:
 * an admin's sentence beats a seed's, and a seed that re-runs must not
 * undo what somebody edited in between.
 */
async function enrich(
  row: { id: string; name: string; description: string | null; synonyms: string[] },
  description: string,
  synonyms: string[],
) {
  const data: { description?: string; synonyms?: string[] } = {};
  // A blank on either side means "this seed has nothing to add" — never an
  // instruction to write an empty string. Writing `''` would also make the
  // run non-idempotent: `!''` is true, so every re-run would write it again.
  if (!row.description && description) data.description = description;
  if (row.synonyms.length === 0 && synonyms.length > 0) data.synonyms = synonyms;
  if (Object.keys(data).length === 0) return;
  await prisma.category.update({ where: { id: row.id }, data });
  console.log(`    ~ ${row.name}: ${Object.keys(data).join(', ')}`);
}

/**
 * A shelf with this name, anywhere on the craft side — top-level or under
 * somebody — with case and accents folded (`fold-name.ts`). Scoping this
 * to one parent is exactly how production ended up holding both
 * "Home Décor" and "Home Decor".
 */
async function findCraftShelf(name: string) {
  const craft = await prisma.category.findMany({ where: { group: ProductKind.craft } });
  return findSameName(craft, name);
}

async function main() {
  let created = 0;
  let adopted = 0;
  const renames: string[] = [];

  for (const [index, dept] of DEPARTMENTS.entries()) {
    // The department itself: an existing shelf of that name, else the shelf
    // it replaces, else a new one.
    let row = await findCraftShelf(dept.name);
    if (!row) {
      for (const former of dept.formerly ?? []) {
        const legacy = await findCraftShelf(former);
        if (legacy && legacy.parentId === null) {
          row = legacy;
          renames.push(`"${legacy.name}" → "${dept.name}"`);
          break;
        }
      }
    }

    if (row && row.parentId !== null) {
      // It exists, but as somebody's child — promoting it is a structural
      // decision an admin makes, not a seed (M58: a parent may not have a
      // parent, so this needs a person).
      console.warn(`! "${dept.name}" exists under another shelf — left alone, needs an admin`);
      continue;
    }

    if (row) {
      adopted += 1;
      console.log(`= ${dept.name}${row.name === dept.name ? '' : ` (as "${row.name}")`}`);
    } else {
      row = await prisma.category.create({
        data: {
          name: dept.name,
          slug: await freeSlug(slugify(dept.name)),
          group: ProductKind.craft,
          parentId: null,
          // No photograph: the tile face is a real listing's photo chosen
          // server-side, never stock or generated imagery.
          imagePlaceholder: dept.name.toUpperCase(),
          sortOrder: index + 1,
          description: dept.description,
          synonyms: dept.synonyms,
        },
      });
      created += 1;
      console.log(`+ ${dept.name}`);
    }

    await enrich(row, dept.description, dept.synonyms);

    for (const [childIndex, child] of dept.children.entries()) {
      const existing = await findCraftShelf(child.name);
      if (existing) {
        console.log(
          `  = ${child.name}${existing.parentId === row.id ? '' : ' (already there elsewhere; not duplicated)'}`,
        );
        await enrich(existing, '', child.synonyms ?? []);
        continue;
      }
      const madeChild = await prisma.category.create({
        data: {
          name: child.name,
          slug: await freeSlug(slugify(child.name)),
          group: ProductKind.craft,
          parentId: row.id,
          imagePlaceholder: child.name.toUpperCase(),
          sortOrder: childIndex + 1,
          synonyms: child.synonyms ?? [],
        },
      });
      created += 1;
      console.log(`  + ${madeChild.name}`);
    }
  }

  console.log(`\n${created} shelves created, ${adopted} adopted.`);
  if (renames.length > 0) {
    console.log(
      `\nFor the data pass (this seed never renames a live shelf):\n  ${renames.join('\n  ')}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
