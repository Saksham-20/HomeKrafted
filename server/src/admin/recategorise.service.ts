import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCatalogService } from './catalog.service';
import { confidenceOf, proposeShelf, type ShelfForMatching } from './recategorise';

/**
 * G1 — the bulk Recategorise screen's data (docs/GIFTING-REWORK.md §3.5).
 *
 * **Nothing is re-filed automatically.** This lists proposals; an admin
 * approves the rows they agree with, and only then does anything move. The
 * matching itself is in `recategorise.ts`, pure and shared with the CLI
 * script, so the CSV somebody reviews offline is the same set of proposals
 * the screen offers.
 */
@Injectable()
export class AdminRecategoriseService {
  constructor(
    private readonly prisma: PrismaService,
    // M44 — product writes go through one owner, and `actor: 'admin'` is
    // what stops a move re-queueing a live listing. An operator tidying
    // our own taxonomy must not take a catalogue off sale to do it.
    private readonly catalog: AdminCatalogService,
  ) {}

  async proposals(kind: ProductKind = ProductKind.craft) {
    const rows = await this.prisma.category.findMany({
      where: { group: kind, archivedAt: null, mergedIntoId: null },
      include: { parent: { select: { name: true } } },
    });
    const shelves: ShelfForMatching[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      synonyms: row.synonyms,
      parentId: row.parentId,
      parentName: row.parent?.name ?? null,
    }));

    const products = await this.prisma.product.findMany({
      where: { kind },
      include: {
        vendor: { select: { name: true } },
        category: { select: { id: true, name: true } },
        categories: { select: { categoryId: true } },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      const proposal = proposeShelf(product, shelves);
      // "Already there" has to read **both** places a listing's shelves
      // live: the join, and `Product.categoryId`, which is the primary.
      // Pre-M58 rows carry a primary with no join row at all, so checking
      // the join alone offered a move onto the shelf the listing was
      // already filed under — measured on seeded data, where
      // "Personalised Name Keyring" was proposed a move to Personalised
      // Gifts. A proposal that does nothing spends the operator's trust
      // in every other row on the screen.
      const alreadyThere =
        proposal !== null &&
        (product.categoryId === proposal.shelf.id ||
          product.categories.some((link) => link.categoryId === proposal.shelf.id));

      return {
        productId: product.id,
        name: product.name,
        maker: product.vendor.name,
        currentShelf: { id: product.category.id, name: product.category.name },
        proposed:
          proposal && !alreadyThere
            ? {
                categoryId: proposal.shelf.id,
                name: proposal.shelf.parentName
                  ? `${proposal.shelf.parentName} › ${proposal.shelf.name}`
                  : proposal.shelf.name,
              }
            : null,
        /** The words that matched — an operator's whole audit trail. */
        why: proposal ? proposal.hits : [],
        // Said out loud rather than omitted. A listing the rule could not
        // place is exactly the one a person should look at, and a silent
        // skip hides it in the gap between two rows.
        confidence: alreadyThere ? ('keep' as const) : confidenceOf(proposal),
      };
    });
  }

  /**
   * Move one listing onto a shelf.
   *
   * The new shelf becomes the **primary** category — the breadcrumb and the
   * canonical URL — and `ProductCategory` is rewritten to match, because
   * the join carries the primary too and changing one without the other is
   * how a listing disappears from the shelf it claims (M58).
   */
  async apply(adminUserId: string, productId: string, categoryId: string) {
    const [product, category] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        include: { categories: { select: { categoryId: true } } },
      }),
      this.prisma.category.findUnique({ where: { id: categoryId } }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!category) throw new NotFoundException('Category not found');

    // Keep whatever else it was filed under, minus the shelf it is leaving
    // as primary — a listing on three shelves stays on the other two.
    const extras = product.categories
      .map((link) => link.categoryId)
      .filter((id) => id !== product.categoryId && id !== categoryId);

    return this.catalog.updateProduct(adminUserId, productId, {
      categoryId,
      categoryIds: extras,
    });
  }
}
