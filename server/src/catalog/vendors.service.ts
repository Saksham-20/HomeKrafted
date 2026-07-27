import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from './mappers/product.mapper';
import { mapVendor } from './mappers/vendor.mapper';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const vendors = await this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
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
