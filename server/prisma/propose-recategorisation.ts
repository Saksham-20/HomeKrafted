/**
 * G1 — print where each live listing probably belongs, as CSV
 * (docs/GIFTING-REWORK.md §3.5).
 *
 * **Read-only. It proposes; it never writes.** An admin approves rows on
 * `/admin/catalog/recategorise`, and that is what moves a listing — the
 * M36 rule applied to the catalogue: a guess written onto a real storefront
 * looks authoritative, and "a script did it" is not something a maker can
 * argue with.
 *
 * The matching lives in `src/admin/recategorise.ts` and is **shared with
 * the screen**, so the CSV somebody reviews offline is the same set of
 * proposals they will be approving. A second copy of the rule here is how
 * the two quietly stop agreeing.
 *
 * It is a `.ts` beside the seeds rather than a `.mjs` under `scripts/`
 * for exactly that reason — it has to import the server's own module.
 *
 *   npx ts-node prisma/propose-recategorisation.ts > /tmp/recategorise.csv
 *   npx ts-node prisma/propose-recategorisation.ts --kind=food
 */
import { PrismaClient, ProductKind } from '@prisma/client';
import { confidenceOf, proposeShelf, type ShelfForMatching } from '../src/admin/recategorise';

const prisma = new PrismaClient();

const arg = (name: string, fallback: string) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const KIND = arg('kind', 'craft') === 'food' ? ProductKind.food : ProductKind.craft;

const csv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

async function main() {
  const rows = await prisma.category.findMany({
    where: { group: KIND, archivedAt: null, mergedIntoId: null },
    include: { parent: { select: { name: true } } },
  });
  const shelves: ShelfForMatching[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    synonyms: row.synonyms,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
  }));

  const products = await prisma.product.findMany({
    where: { kind: KIND },
    include: {
      vendor: { select: { name: true } },
      category: { select: { id: true, name: true } },
      categories: { select: { categoryId: true } },
    },
    orderBy: { name: 'asc' },
  });

  console.log(
    ['listing', 'maker', 'current shelf', 'proposed shelf', 'why', 'confidence'].map(csv).join(','),
  );

  let moves = 0;
  for (const product of products) {
    const proposal = proposeShelf(product, shelves);
    // Both places a listing's shelves live — the join and the primary.
    // A pre-M58 row has a primary and no join row, and reading only the
    // join proposes a move onto the shelf it is already on.
    const alreadyThere =
      proposal !== null &&
      (product.categoryId === proposal.shelf.id ||
        product.categories.some((link) => link.categoryId === proposal.shelf.id));

    const proposed =
      proposal && !alreadyThere
        ? proposal.shelf.parentName
          ? `${proposal.shelf.parentName} › ${proposal.shelf.name}`
          : proposal.shelf.name
        : '';
    if (proposed) moves += 1;

    console.log(
      [
        product.name,
        product.vendor.name,
        product.category.name,
        proposed,
        proposal ? `matched ${proposal.hits.map((hit) => `"${hit}"`).join(', ')}` : 'no word matched any shelf',
        alreadyThere ? 'keep' : confidenceOf(proposal),
      ]
        .map(csv)
        .join(','),
    );
  }

  console.error(`\n${products.length} ${KIND} listings read, ${moves} proposed moves. Nothing was written.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
