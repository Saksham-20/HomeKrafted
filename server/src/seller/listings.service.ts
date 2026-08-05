import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductTag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from '../catalog/mappers/product.mapper';
import { dietaryTagsFromFrontend } from '../catalog/dietary-tag.util';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Maker listing CRUD — every method takes the caller's own `vendorId`
 * (resolved server-side from their JWT's `sellerId` by `SellerService`,
 * never a route/body param) and scopes every read + write to it. A
 * product id that exists but belongs to a different vendor 404s, exactly
 * like a nonexistent one — never leaks existence via a 403.
 */
@Injectable()
export class SellerListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(vendorId: string) {
    const products = await this.prisma.product.findMany({
      where: { vendorId },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return products.map(mapProduct);
  }

  /** Ownership-scoped: 404s (not 403) for a real product id belonging to another vendor. */
  async getOne(vendorId: string, productId: string) {
    const product = await this.assertOwned(vendorId, productId);
    return mapProduct(product);
  }

  async create(vendorId: string, dto: CreateListingDto) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.occasionIds?.length) {
      const found = await this.prisma.occasion.count({ where: { id: { in: dto.occasionIds } } });
      if (found !== dto.occasionIds.length) throw new NotFoundException('One or more occasions not found');
    }

    await this.assertSkusAvailable(dto.weightOptions.map((w) => w.sku));
    this.assertDefaultSkuPresent(dto);

    const slug = await this.uniqueSlug(dto.name);

    const created = await this.prisma.product.create({
      data: {
        slug,
        vendorId,
        name: dto.name,
        categoryId: dto.categoryId,
        dietary: dietaryTagsFromFrontend(dto.dietary ?? []),
        defaultWeightSku: dto.defaultWeightSku,
        tags: (dto.tags ?? []) as ProductTag[],
        isPackaged: dto.isPackaged,
        isHamper: dto.isHamper ?? false,
        // M20 section flags. All three default the way a pre-M20 listing
        // behaved, so an old client that sends none of them is unchanged.
        kind: dto.kind ?? 'food',
        shippingScope: dto.shippingScope ?? 'local',
        isSnack: dto.isSnack ?? false,
        cashbackPct: dto.cashbackPct,
        description: dto.description,
        images: {
          create: [{ placeholder: `${dto.name} product photo`, src: dto.imagePath || undefined, ratio: '1/1', sortOrder: 0 }],
        },
        weightOptions: { create: dto.weightOptions },
        occasions: { create: (dto.occasionIds ?? []).map((occasionId) => ({ occasionId })) },
      },
      include: PRODUCT_INCLUDE,
    });

    return mapProduct(created);
  }

  async update(vendorId: string, productId: string, dto: UpdateListingDto) {
    const existing = await this.assertOwned(vendorId, productId);

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }
    if (dto.occasionIds?.length) {
      const found = await this.prisma.occasion.count({ where: { id: { in: dto.occasionIds } } });
      if (found !== dto.occasionIds.length) throw new NotFoundException('One or more occasions not found');
    }
    if (dto.weightOptions?.length) {
      await this.assertSkusAvailable(
        dto.weightOptions.map((w) => w.sku),
        productId,
      );
    }
    if (dto.defaultWeightSku && dto.weightOptions?.length) {
      this.assertDefaultSkuPresent({ weightOptions: dto.weightOptions, defaultWeightSku: dto.defaultWeightSku });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.weightOptions) {
        await tx.weightOption.deleteMany({ where: { productId } });
        await tx.weightOption.createMany({ data: dto.weightOptions.map((w) => ({ ...w, productId })) });
      }
      if (dto.occasionIds) {
        await tx.productOccasion.deleteMany({ where: { productId } });
        await tx.productOccasion.createMany({ data: dto.occasionIds.map((occasionId) => ({ productId, occasionId })) });
      }
      if (dto.imagePath !== undefined) {
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.productImage.create({
          data: {
            productId,
            placeholder: `${dto.name ?? existing.name} product photo`,
            src: dto.imagePath || undefined,
            ratio: '1/1',
            sortOrder: 0,
          },
        });
      }

      return tx.product.update({
        where: { id: productId },
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          dietary: dto.dietary ? dietaryTagsFromFrontend(dto.dietary) : undefined,
          defaultWeightSku: dto.defaultWeightSku,
          tags: dto.tags as ProductTag[] | undefined,
          isPackaged: dto.isPackaged,
          isHamper: dto.isHamper,
          kind: dto.kind,
          shippingScope: dto.shippingScope,
          isSnack: dto.isSnack,
          cashbackPct: dto.cashbackPct,
          description: dto.description,
        },
        include: PRODUCT_INCLUDE,
      });
    });

    return mapProduct(updated);
  }

  /**
   * Flip a single listing on or off for the day.
   *
   * `isAvailable` is the HomeKrafter's switch; `moderationStatus` is the
   * admin's. Keeping them apart means an admin un-hiding an item can't
   * silently put a dish back on sale that the cook isn't making, and a cook
   * marking themselves sold out can't override a moderation hide.
   */
  async setAvailability(vendorId: string, productId: string, isAvailable: boolean) {
    await this.assertOwned(vendorId, productId);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { isAvailable },
      include: PRODUCT_INCLUDE,
    });
    return mapProduct(updated);
  }

  async remove(vendorId: string, productId: string): Promise<void> {
    await this.assertOwned(vendorId, productId);
    try {
      await this.prisma.product.delete({ where: { id: productId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete a listing that has existing orders, cart, wishlist, or hamper references — mark it unavailable instead',
        );
      }
      throw err;
    }
  }

  /** Also used by `SellerOrdersService`/dashboard to compute "this vendor's products" without duplicating the query. */
  async assertOwned(vendorId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    if (!product || product.vendorId !== vendorId) {
      throw new NotFoundException('Listing not found');
    }
    return product;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const exists = await this.prisma.product.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  private async assertSkusAvailable(skus: string[], excludeProductId?: string): Promise<void> {
    const clashes = await this.prisma.weightOption.findMany({ where: { sku: { in: skus } } });
    const foreignClash = clashes.find((w) => w.productId !== excludeProductId);
    if (foreignClash) {
      throw new ConflictException(`SKU "${foreignClash.sku}" is already in use`);
    }
  }

  private assertDefaultSkuPresent(dto: { weightOptions: { sku: string }[]; defaultWeightSku: string }): void {
    if (!dto.weightOptions.some((w) => w.sku === dto.defaultWeightSku)) {
      throw new BadRequestException('defaultWeightSku must match one of the provided weightOptions');
    }
  }
}
