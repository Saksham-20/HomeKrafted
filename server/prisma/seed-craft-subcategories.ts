/**
 * Seeds subcategory trees under the existing craft parent categories
 * (Candles & Home, Handmade Jewellery, Art & Prints, Personalised Gifts).
 *
 * **Additive and idempotent.** Parents are looked up by name and parentId: null,
 * and must already exist (seeded via seed-crafts.ts). Children are filed
 * under their respective parents using ensure() with group: ProductKind.craft.
 * Never renames, re-parents, or deletes anything already there. Safe to run
 * on production, and safe to re-run.
 *
 *   npx ts-node prisma/seed-craft-subcategories.ts
 */
import { PrismaClient, ProductKind } from '@prisma/client';

const prisma = new PrismaClient();

interface Tree {
  group: ProductKind;
  parent: string;
  children: string[];
}

const TREES: Tree[] = [
  {
    group: ProductKind.craft,
    parent: 'Candles & Home',
    children: ['Scented Candles', 'Home Decor', 'Ceramics', 'Textiles'],
  },
  {
    group: ProductKind.craft,
    parent: 'Handmade Jewellery',
    children: ['Earrings', 'Necklaces', 'Bracelets', 'Rings'],
  },
  {
    group: ProductKind.craft,
    parent: 'Art & Prints',
    children: ['Paintings', 'Prints & Posters', 'Wall Art'],
  },
  {
    group: ProductKind.craft,
    parent: 'Personalised Gifts',
    children: ['Engraved', 'Custom Prints', 'Name & Initial'],
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

async function ensure(name: string, group: ProductKind, parentId: string | null, sortOrder: number) {
  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, parentId },
  });
  if (existing) {
    console.log(`  = ${name} (already there)`);
    return existing;
  }
  const created = await prisma.category.create({
    data: {
      name,
      slug: await freeSlug(slugify(name)),
      group,
      parentId,
      // No photograph: nothing has been supplied for a shelf nobody has
      // listed in yet, and inventing product imagery is forbidden.
      imagePlaceholder: name.toUpperCase(),
      sortOrder,
    },
  });
  console.log(`  + ${name}`);
  return created;
}

async function main() {
  for (const tree of TREES) {
    console.log(`${tree.group}: ${tree.parent}`);
    const parent = await prisma.category.findFirst({
      where: {
        name: { equals: tree.parent, mode: 'insensitive' },
        parentId: null,
      },
    });

    if (!parent) {
      console.warn(`  ! Parent category "${tree.parent}" not found — skipping tree`);
      continue;
    }

    let i = 0;
    for (const child of tree.children) {
      i += 1;
      await ensure(child, tree.group, parent.id, i);
    }
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
