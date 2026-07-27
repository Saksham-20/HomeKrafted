import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { mapReview } from './reviews.mapper';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Excludes moderator-hidden reviews — same rule `lib/api/reviews.ts#getProductReviews`/`getVendorReviews` apply. */
  async list(targetType: 'product' | 'vendor' | 'service', targetId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { targetType, targetId, hidden: false },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map(mapReview);
  }

  async create(userId: string, dto: CreateReviewDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.assertTargetExists(dto.targetType, dto.targetId);
    const verifiedPurchase = await this.computeVerifiedPurchase(userId, dto.targetType, dto.targetId);

    const review = await this.prisma.review.create({
      data: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        userId,
        userName: user.name,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        verifiedPurchase,
      },
    });
    return mapReview(review);
  }

  private async assertTargetExists(targetType: 'product' | 'vendor' | 'service', targetId: string): Promise<void> {
    if (targetType === 'product') {
      const product = await this.prisma.product.findUnique({ where: { id: targetId } });
      if (!product) throw new NotFoundException('Product not found');
    } else if (targetType === 'vendor') {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: targetId } });
      if (!vendor) throw new NotFoundException('Vendor not found');
    } else {
      // 'service' -> a LaundryService id today (the only service-shaped
      // entity that exists pre-M8.3). Snack sellers have no equivalent
      // reviewable entity yet.
      const service = await this.prisma.laundryService.findUnique({ where: { id: targetId } });
      if (!service) throw new NotFoundException('Service not found');
    }
  }

  /**
   * "Verified purchase" = the reviewer has a non-cancelled `Order`
   * containing this product (or, for a vendor review, any product from
   * that vendor). `targetType: "service"` always reads `false` here —
   * `LaundryBooking`-based verification is an M8.3 seam (no laundry
   * endpoints exist yet in this milestone to have created a booking).
   */
  private async computeVerifiedPurchase(
    userId: string,
    targetType: 'product' | 'vendor' | 'service',
    targetId: string,
  ): Promise<boolean> {
    if (targetType === 'product') {
      const count = await this.prisma.orderItem.count({
        where: { productId: targetId, order: { userId, status: { not: 'cancelled' } } },
      });
      return count > 0;
    }
    if (targetType === 'vendor') {
      const count = await this.prisma.orderItem.count({
        where: { product: { vendorId: targetId }, order: { userId, status: { not: 'cancelled' } } },
      });
      return count > 0;
    }
    return false;
  }
}
