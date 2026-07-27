import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapCollection } from '../catalog/mappers/vendor.mapper';
import { AdminAuditLogService } from './audit-log.service';
import { UpsertCollectionDto } from './dto/upsert-collection.dto';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const COLLECTION_INCLUDE = { products: { orderBy: { sortOrder: 'asc' as const } } };

/**
 * Occasion `Collection` CRUD — title/description/occasion + product
 * membership and order. `productIds` array order is the collection's
 * real display order (`docs/DATA-MODEL.md`), written as
 * `CollectionProduct.sortOrder` — every save deletes and recreates the
 * join rows in the new order (same recipe `SellerListingsService.update`
 * uses for a product's `weightOptions`/`occasionIds`), so "reorder" is
 * just re-submitting `productIds` in the new order.
 */
@Injectable()
export class AdminCollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list() {
    const collections = await this.prisma.collection.findMany({ include: COLLECTION_INCLUDE });
    return collections.map((c) => mapCollection(c, c.products.map((p) => p.productId)));
  }

  async getById(id: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id }, include: COLLECTION_INCLUDE });
    if (!collection) throw new NotFoundException('Collection not found');
    return mapCollection(collection, collection.products.map((p) => p.productId));
  }

  async create(adminUserId: string, dto: UpsertCollectionDto) {
    await this.assertProductsExist(dto.productIds);
    if (dto.occasionId) await this.assertOccasionExists(dto.occasionId);

    const slug = await this.uniqueSlug(dto.title);
    const collection = await this.prisma.$transaction(async (tx) => {
      const created = await tx.collection.create({
        data: { slug, title: dto.title, description: dto.description, occasionId: dto.occasionId },
      });
      await tx.collectionProduct.createMany({
        data: dto.productIds.map((productId, sortOrder) => ({ collectionId: created.id, productId, sortOrder })),
      });
      return tx.collection.findUniqueOrThrow({ where: { id: created.id }, include: COLLECTION_INCLUDE });
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'collection.create',
      targetType: 'Collection',
      targetId: collection.id,
    });

    return mapCollection(collection, collection.products.map((p) => p.productId));
  }

  async update(adminUserId: string, id: string, dto: UpsertCollectionDto) {
    const existing = await this.prisma.collection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Collection not found');

    await this.assertProductsExist(dto.productIds);
    if (dto.occasionId) await this.assertOccasionExists(dto.occasionId);

    const collection = await this.prisma.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id },
        data: { title: dto.title, description: dto.description, occasionId: dto.occasionId ?? null },
      });
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      await tx.collectionProduct.createMany({
        data: dto.productIds.map((productId, sortOrder) => ({ collectionId: id, productId, sortOrder })),
      });
      return tx.collection.findUniqueOrThrow({ where: { id }, include: COLLECTION_INCLUDE });
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'collection.update',
      targetType: 'Collection',
      targetId: id,
    });

    return mapCollection(collection, collection.products.map((p) => p.productId));
  }

  async remove(adminUserId: string, id: string): Promise<void> {
    const existing = await this.prisma.collection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Collection not found');

    await this.prisma.collection.delete({ where: { id } });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'collection.delete',
      targetType: 'Collection',
      targetId: id,
    });
  }

  private async assertProductsExist(productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    const found = await this.prisma.product.count({ where: { id: { in: productIds } } });
    if (found !== productIds.length) throw new NotFoundException('One or more products were not found');
  }

  private async assertOccasionExists(occasionId: string): Promise<void> {
    const occasion = await this.prisma.occasion.findUnique({ where: { id: occasionId } });
    if (!occasion) throw new NotFoundException('Occasion not found');
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const exists = await this.prisma.collection.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
