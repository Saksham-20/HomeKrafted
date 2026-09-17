import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapCategory, mapCollection, mapOccasion } from './mappers/vendor.mapper';

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    // `sortOrder` first, then name. The schema documents `sortOrder` as
    // what drives the home page's tile order, and ordering by name alone
    // silently ignored it — ties still fall back to name, so an unset
    // value stays stable rather than random.
    //
    // Archived and merged shelves are excluded, the same way
    // `AttributesService.departments()` already does (G1: "An archived
    // category leaves the pickers and the browse page while every link,
    // breadcrumb and order already pointing at it keeps resolving") — this
    // is the picker/browse half of that contract. `getCategory(slug)` below
    // stays unfiltered on purpose, so an old shared link still resolves.
    const categories = await this.prisma.category.findMany({
      where: { archivedAt: null, mergedIntoId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map(mapCategory);
  }

  async getCategory(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    return mapCategory(category);
  }

  /**
   * Unfiltered by id, on purpose — the same reason `getCategory(slug)`
   * above is unfiltered: a product's `categoryId` (the breadcrumb) has to
   * keep resolving after the category is archived or merged away, even
   * though `listCategories()` above has already dropped it from every
   * picker and browse page. Archiving must never silently blank a
   * breadcrumb on a listing still filed under the shelf.
   */
  async getCategoryById(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return mapCategory(category);
  }

  async listOccasions() {
    const occasions = await this.prisma.occasion.findMany({ orderBy: { name: 'asc' } });
    return occasions.map(mapOccasion);
  }

  async getOccasion(slug: string) {
    const occasion = await this.prisma.occasion.findUnique({ where: { slug } });
    if (!occasion) throw new NotFoundException('Occasion not found');
    return mapOccasion(occasion);
  }

  async listCollections() {
    const collections = await this.prisma.collection.findMany({
      // M16: `sortOrder` is the merchandiser's running order, so it leads.
      // Title is the tiebreak rather than `id`, so two guides at the same
      // position don't swap places between requests.
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { products: { orderBy: { sortOrder: 'asc' } } },
    });
    return collections.map((c) => mapCollection(c, c.products.map((p) => p.productId)));
  }

  async getCollection(slug: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { slug },
      include: { products: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    return mapCollection(collection, collection.products.map((p) => p.productId));
  }

  /** Static reference data for the hamper builder (`POST /cart/hamper-items` consumes a `boxId` from this list). */
  async listHamperBoxes() {
    const boxes = await this.prisma.hamperBox.findMany({ orderBy: { price: 'asc' } });
    return boxes.map((b) => ({
      id: b.id,
      name: b.name,
      maxItems: b.maxItems,
      price: Number(b.price),
      itemsLabel: b.itemsLabel,
    }));
  }
}
