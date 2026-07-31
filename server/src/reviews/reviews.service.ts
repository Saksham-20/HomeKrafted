import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewAggregatesService } from './review-aggregates.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { mapReview } from './reviews.mapper';

type ReviewTarget = 'product' | 'vendor' | 'service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregates: ReviewAggregatesService,
  ) {}

  /** Excludes moderator-hidden reviews — same rule `lib/api/reviews.ts#getProductReviews`/`getVendorReviews` apply. */
  async list(targetType: ReviewTarget, targetId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { targetType, targetId, hidden: false },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map(mapReview);
  }

  /**
   * The signed-in reviewer's own reviews, hidden ones included — a review
   * taken down by a moderator must still be visible to the person who
   * wrote it, or "why is my review gone" has no answer anywhere in the
   * product. Powers `/account/reviews`.
   */
  async listMine(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map(mapReview);
  }

  /**
   * Everything the reviewer is currently allowed to review and hasn't yet
   * — one row per delivered product, plus the HomeKrafter behind it.
   * `/account/reviews` renders it as the "waiting for your review" list,
   * which is the only prompt to review the product has.
   */
  async listPending(userId: string) {
    const [items, existing] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { order: { userId, status: 'delivered' } },
        include: {
          product: {
            include: {
              vendor: true,
              images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          },
        },
        orderBy: { order: { placedAt: 'desc' } },
      }),
      this.prisma.review.findMany({ where: { userId }, select: { targetType: true, targetId: true } }),
    ]);

    const reviewed = new Set(existing.map((r) => `${r.targetType}:${r.targetId}`));
    const seen = new Set<string>();
    const pending: {
      targetType: ReviewTarget;
      targetId: string;
      name: string;
      slug: string;
      vendorName: string;
      imageSrc?: string;
      imagePlaceholder: string;
    }[] = [];

    for (const item of items) {
      if (!item.product) continue;
      const key = `product:${item.product.id}`;
      if (reviewed.has(key) || seen.has(key)) continue;
      seen.add(key);
      pending.push({
        targetType: 'product',
        targetId: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        vendorName: item.product.vendor.name,
        imageSrc: item.product.images[0]?.src ?? undefined,
        imagePlaceholder: item.product.images[0]?.placeholder ?? item.product.name,
      });
    }

    return pending;
  }

  /**
   * **Only a delivered order earns a review.** The pre-M15 rule was
   * "anyone signed in", with `verifiedPurchase` recorded as a badge — on
   * a marketplace whose whole proposition is trusting a stranger's home
   * kitchen, an unverified review is worth less than no review, and an
   * open write endpoint is a spam surface aimed squarely at the newest
   * HomeKrafter with three reviews.
   *
   * `verifiedPurchase` stays on the model rather than becoming dead
   * weight: seeded rows predate this rule, and a moderator issuing a
   * correction later has somewhere truthful to record it.
   */
  async create(userId: string, dto: CreateReviewDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.assertTargetExists(dto.targetType, dto.targetId);

    const verifiedPurchase = await this.computeVerifiedPurchase(userId, dto.targetType, dto.targetId);
    if (!verifiedPurchase) {
      throw new ForbiddenException(
        'You can review this once an order containing it has been delivered',
      );
    }

    const duplicate = await this.prisma.review.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
    });
    if (duplicate) {
      throw new ConflictException('You have already reviewed this');
    }

    // Write and re-aggregate together: a rating that lands without moving
    // the card it appears on is the same bug as not saving it at all.
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
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
      await this.aggregates.recompute(dto.targetType, dto.targetId, tx);
      return created;
    });

    return mapReview(review);
  }

  private async assertTargetExists(targetType: ReviewTarget, targetId: string): Promise<void> {
    if (targetType === 'product') {
      const product = await this.prisma.product.findUnique({ where: { id: targetId } });
      if (!product) throw new NotFoundException('Product not found');
    } else if (targetType === 'vendor') {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: targetId } });
      if (!vendor) throw new NotFoundException('Vendor not found');
    } else {
      // 'service' -> a LaundryService id.
      const service = await this.prisma.laundryService.findUnique({ where: { id: targetId } });
      if (!service) throw new NotFoundException('Service not found');
    }
  }

  /**
   * "Verified purchase" = the reviewer has a **delivered** order
   * containing this product (for a vendor review, any product from that
   * vendor; for a service, a delivered `LaundryBooking` for it).
   *
   * Delivered rather than merely not-cancelled: a review written while
   * the parcel is still with the HomeKrafter is a review of the checkout,
   * and it is the one an unhappy buyer writes fastest.
   */
  private async computeVerifiedPurchase(
    userId: string,
    targetType: ReviewTarget,
    targetId: string,
  ): Promise<boolean> {
    if (targetType === 'product') {
      const count = await this.prisma.orderItem.count({
        where: { productId: targetId, order: { userId, status: 'delivered' } },
      });
      return count > 0;
    }
    if (targetType === 'vendor') {
      const count = await this.prisma.orderItem.count({
        where: { product: { vendorId: targetId }, order: { userId, status: 'delivered' } },
      });
      return count > 0;
    }
    const count = await this.prisma.laundryBookingLine.count({
      where: { serviceId: targetId, booking: { userId, status: 'delivered' } },
    });
    return count > 0;
  }
}
