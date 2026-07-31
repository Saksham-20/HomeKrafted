import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from './mappers/product.mapper';
import { mapVendor } from './mappers/vendor.mapper';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `q` searches the HomeKrafter's name, their bio and their area, so
   * "Sector 35" and "pickle" both surface kitchens on `/search`. AND
   * across terms, OR across fields — same rule as `ProductsService.list`.
   */
  async list(q?: string) {
    const terms = q ? q.trim().split(/\s+/).filter(Boolean).slice(0, 6) : [];
    const vendors = await this.prisma.vendor.findMany({
      where:
        terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { bio: { contains: term, mode: 'insensitive' as const } },
                  { area: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : undefined,
      orderBy: { name: 'asc' },
    });
    return vendors.map((v) => mapVendor(v));
  }

  async getBySlug(slug: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return mapVendor(vendor);
  }

  /** Excludes `moderationStatus: "hidden"` — same rule `lib/api/products.ts#getProductsByVendor` applies (a storefront listing, not a single-item resolve). */
  async productsBySlug(slug: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const products = await this.prisma.product.findMany({
      where: { vendorId: vendor.id, moderationStatus: { not: 'hidden' } },
      include: PRODUCT_INCLUDE,
    });
    return products.map((p) => mapProduct(p));
  }
}
