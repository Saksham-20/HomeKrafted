/**
 * The client's category lists for the two browse pages
 * (Homekrafted website-changes doc, 2026-09-02).
 *
 * **Additive and idempotent**, the same contract as
 * `seed-subcategories.ts`: it creates shelves that are not there and
 * touches nothing that is. Safe on production, safe to re-run.
 *
 *   npx ts-node prisma/seed-client-categories.ts
 *
 * The doc's lists overlap shelves that already hold products, and those
 * are deliberately left alone rather than duplicated or re-parented:
 *
 *   North Indian · Punjabi · Breakfast   already exist as children of
 *                                        "Shop by cuisine" / "Shop by meal"
 *   Snacks · Pickles · Hampers           existing top-level food shelves
 *   Personalised Gifts · Candles & Home
 *   Handmade Jewellery                   existing top-level craft shelves
 *
 * Two shelves with the same name on opposite sides of the tree is exactly
 * the ambiguity the taxonomy exists to avoid, and the uniqueness check
 * (scoped to parent) would not catch it.
 *
 * "Gifts Under ₹999" from the doc is deliberately **not** here: it is a
 * price band, both browse pages already carry a price filter, and a
 * hand-tagged shelf goes stale the moment a maker edits a price.
 */
import { PrismaClient, ProductKind } from '@prisma/client';

const prisma = new PrismaClient();

interface Shelf {
  name: string;
  group: ProductKind;
}

/** `sortOrder` starts past the existing craft shelves (10–13). */
const SHELVES: Shelf[] = [
  { name: 'Street Food', group: ProductKind.food },
  { name: 'Beverages', group: ProductKind.food },
  { name: 'Cakes & Desserts', group: ProductKind.food },
  { name: 'Combos', group: ProductKind.food },
  { name: 'Sunday Specials', group: ProductKind.food },
  { name: 'Handmade Gifts', group: ProductKind.craft },
  { name: 'Home Décor', group: ProductKind.craft },
  { name: 'Flowers', group: ProductKind.craft },
  { name: 'Self-Care', group: ProductKind.craft },
  { name: 'Festive Gifts', group: ProductKind.craft },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

async function main() {
  let order = 20;
  for (const shelf of SHELVES) {
    order += 1;
    // Name match is deliberately unscoped by parent: a top-level shelf
    // duplicating the name of somebody's subcategory is the ambiguity
    // above, so an existing row anywhere in the tree counts as "there".
    const existing = await prisma.category.findFirst({
      where: { name: { equals: shelf.name, mode: 'insensitive' } },
    });
    if (existing) {
      console.log(`= ${shelf.name} (already there)`);
      continue;
    }
    await prisma.category.create({
      data: {
        name: shelf.name,
        slug: await freeSlug(slugify(shelf.name)),
        group: shelf.group,
        parentId: null,
        // No photograph: nothing has been supplied for a shelf nobody has
        // listed in yet, and inventing product imagery is forbidden. The
        // home page's rail only renders photographed categories, so these
        // appear in browse, filters and the header panels until art lands.
        imagePlaceholder: shelf.name.toUpperCase(),
        sortOrder: order,
      },
    });
    console.log(`+ ${shelf.name}`);
  }
  const total = await prisma.category.count();
  console.log(`\n${total} categories total.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
