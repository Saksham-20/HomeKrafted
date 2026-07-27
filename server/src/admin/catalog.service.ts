import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from '../catalog/mappers/product.mapper';
import { mapReview } from '../reviews/reviews.mapper';
import { AdminAuditLogService } from './audit-log.service';
import { ModerateProductDto } from './dto/moderate-product.dto';

/**
 * Unscoped catalog + review moderation — every `Product` across every
 * vendor, every `Review` across every target. `hide`/`takedown` write the
 * same `moderationStatus: "hidden"` `ProductsService.list`'s public
 * `GET /products` already filters out (`where: { moderationStatus: {
 * not: 'hidden' } }`) — so a hidden product disappears from browse
 * immediately, verified live in this milestone's DoD. `getBySlug` still
 * resolves a hidden product (direct link/cart/order/wishlist lookups must
 * keep working — see `ProductsService.getBySlug`'s doc comment), so
 * "hidden" here means "delisted from browse", not "the row stopped
 * existing".
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async listProducts() {
    const products = await this.prisma.product.findMany({
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const vendorIds = [...new Set(products.map((p) => p.vendorId))];
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } });
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));

    return products.map((p) => ({ ...mapProduct(p), vendorName: vendorNameById.get(p.vendorId) ?? 'Unknown vendor' }));
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundException('Product not found');
    const vendor = await this.prisma.vendor.findUnique({ where: { id: product.vendorId }, select: { name: true } });
    return { ...mapProduct(product), vendorName: vendor?.name ?? 'Unknown vendor' };
  }

  async moderateProduct(adminUserId: string, id: string, dto: ModerateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    const data: { moderationStatus?: 'active' | 'hidden' | 'flagged'; featured?: boolean } = {};
    if (dto.action === 'hide' || dto.action === 'takedown') data.moderationStatus = 'hidden';
    if (dto.action === 'unhide') data.moderationStatus = 'active';
    if (dto.action === 'flag') data.moderationStatus = 'flagged';
    if (dto.action === 'unflag') data.moderationStatus = 'active';
    if (dto.action === 'feature') data.featured = true;
    if (dto.action === 'unfeature') data.featured = false;

    const updated = await this.prisma.product.update({ where: { id }, data, include: PRODUCT_INCLUDE });

    await this.auditLog.log({
      actorId: adminUserId,
      action: `product.${dto.action}`,
      targetType: 'Product',
      targetId: id,
    });

    const vendor = await this.prisma.vendor.findUnique({ where: { id: updated.vendorId }, select: { name: true } });
    return { ...mapProduct(updated), vendorName: vendor?.name ?? 'Unknown vendor' };
  }

  async listReviews() {
    const reviews = await this.prisma.review.findMany({ orderBy: { createdAt: 'desc' } });
    const targetNames = await this.resolveTargetNames(reviews);
    return reviews.map((r) => ({ ...mapReview(r), targetName: targetNames.get(`${r.targetType}:${r.targetId}`) ?? 'Unknown' }));
  }

  async moderateReview(adminUserId: string, id: string, hidden: boolean) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    const updated = await this.prisma.review.update({ where: { id }, data: { hidden } });

    await this.auditLog.log({
      actorId: adminUserId,
      action: hidden ? 'review.hide' : 'review.unhide',
      targetType: 'Review',
      targetId: id,
    });

    return mapReview(updated);
  }

  private async resolveTargetNames(reviews: { targetType: string; targetId: string }[]): Promise<Map<string, string>> {
    const productIds = reviews.filter((r) => r.targetType === 'product').map((r) => r.targetId);
    const vendorIds = reviews.filter((r) => r.targetType === 'vendor').map((r) => r.targetId);
    const serviceIds = reviews.filter((r) => r.targetType === 'service').map((r) => r.targetId);

    const [products, vendors, services] = await Promise.all([
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
      vendorIds.length ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }) : [],
      serviceIds.length
        ? this.prisma.laundryService.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const map = new Map<string, string>();
    for (const p of products) map.set(`product:${p.id}`, p.name);
    for (const v of vendors) map.set(`vendor:${v.id}`, v.name);
    for (const s of services) map.set(`service:${s.id}`, s.name);
    return map;
  }
}
