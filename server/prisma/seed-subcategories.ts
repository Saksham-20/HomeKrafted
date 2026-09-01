/**
 * M58 — the first subcategory trees.
 *
 * **Additive and idempotent.** It creates parents that do not exist and
 * files children under them, and it never renames, re-parents or deletes
 * anything already there. Safe to run on production, and safe to re-run.
 *
 * These are a *starting* vocabulary, not a fixed one: the whole point of
 * M58's "+" button is that an admin curates this from the panel. If a
 * shelf here is wrong for the business, change it there — do not edit this
 * file and re-run expecting a correction, because it will not overwrite.
 *
 *   npx ts-node prisma/seed-subcategories.ts
 */
import { PrismaClient, ProductKind } from '@prisma/client';

const prisma = new PrismaClient();

interface Tree {
  group: ProductKind;
  parent: string;
  children: string[];
}

/**
 * `Snacks` already exists as a top-level food shelf, which is why the meal
 * child is `Snacks & Namkeen`: two shelves with the same name on opposite
 * sides of a tree is exactly the ambiguity the whole taxonomy exists to
 * avoid, and the uniqueness check (scoped to parent) would not catch it.
 */
const TREES: Tree[] = [
  {
    group: ProductKind.craft,
    parent: 'Shop by recipient',
    children: ['For Her', 'For Him', 'For Kids', 'For Parents', 'For Couples', 'For Colleagues'],
  },
  {
    group: ProductKind.food,
    parent: 'Shop by cuisine',
    children: ['North Indian', 'South Indian', 'Bengali', 'Gujarati', 'Punjabi', 'Indo-Chinese'],
  },
  {
    group: ProductKind.food,
    parent: 'Shop by meal',
    children: ['Breakfast', 'Snacks & Namkeen', 'Lunch & Dinner', 'Desserts'],
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
    const parent = await ensure(tree.parent, tree.group, null, 100);
    if (parent.parentId) {
      console.log(`  ! "${tree.parent}" is itself a subcategory — skipping, an admin has re-parented it`);
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
