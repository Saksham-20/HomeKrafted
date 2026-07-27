import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapReview } from '../reviews/reviews.mapper';
import { ReplyReviewDto } from './dto/reply-review.dto';

/**
 * Maker reviews — reads + replies to reviews on this vendor's own
 * products or the vendor itself. Ownership check for `reply` mirrors
 * `ReviewsService`'s target-type branching but scoped down to "does this
 * review target *my* vendor/product" — a review on another vendor's
 * product 404s.
 */
@Injectable()
export class SellerReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(vendorId: string) {
    const productIds = await this.vendorProductIds(vendorId);
    const reviews = await this.prisma.review.findMany({
      where: {
        OR: [
          { targetType: 'vendor', targetId: vendorId },
          ...(productIds.length ? [{ targetType: 'product' as const, targetId: { in: productIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map(mapReview);
  }

  async reply(vendorId: string, reviewId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const owns = await this.reviewBelongsToVendor(review, vendorId);
    if (!owns) throw new NotFoundException('Review not found');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { sellerReplyBody: dto.body, sellerReplyCreatedAt: new Date() },
    });
    return mapReview(updated);
  }

  private async reviewBelongsToVendor(
    review: { targetType: string; targetId: string },
    vendorId: string,
  ): Promise<boolean> {
    if (review.targetType === 'vendor') return review.targetId === vendorId;
    if (review.targetType === 'product') {
      const product = await this.prisma.product.findUnique({ where: { id: review.targetId } });
      return product?.vendorId === vendorId;
    }
    return false;
  }

  private async vendorProductIds(vendorId: string): Promise<string[]> {
    const products = await this.prisma.product.findMany({ where: { vendorId }, select: { id: true } });
    return products.map((p) => p.id);
  }
}
