import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapCategory, mapCollection, mapOccasion } from './mappers/vendor.mapper';

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return categories.map(mapCategory);
  }

  async getCategory(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
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
