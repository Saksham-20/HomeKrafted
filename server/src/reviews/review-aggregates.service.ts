import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ReviewTarget = 'product' | 'vendor' | 'service';

/**
 * Keeps the denormalised `rating`/`reviewCount` columns on `Product`,
 * `Vendor` and `Seller` in step with the `Review` rows behind them.
 *
 * Its own service because **two** paths change what a rating should be —
 * a buyer writing one (`ReviewsService.create`) and a moderator hiding or
 * un-hiding one (`AdminCatalogService.moderateReview`). Before M15 the
 * columns were seed values nothing ever wrote, so the second path was
 * invisible; the moment the first path exists, a hide that leaves the
 * average untouched is a moderator's action silently not taking effect.
 *
 * Always **recomputed from the rows**, never incremented: an incremental
 * counter drifts the first time a path forgets to call it, and nothing
 * in the system would notice.
 */
@Injectable()
export class ReviewAggregatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recompute for a target, joining an open transaction when one is supplied. */
  async recompute(targetType: ReviewTarget, targetId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;

    if (targetType === 'product') {
      const product = await db.product.findUnique({ where: { id: targetId }, select: { vendorId: true } });
      await this.applyProduct(db, targetId);
      // A product's rating moves its kitchen's too — see `applyVendor`.
      if (product) await this.applyVendor(db, product.vendorId);
      return;
    }
    if (targetType === 'vendor') {
      await this.applyVendor(db, targetId);
    }
    // 'service' targets (a LaundryService) carry no denormalised rating
    // column, so there is nothing to keep in step.
  }

  private async applyProduct(db: Prisma.TransactionClient | PrismaService, id: string): Promise<void> {
    const stats = await db.review.aggregate({
      where: { targetType: 'product', targetId: id, hidden: false },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await db.product.update({
      where: { id },
      data: { rating: roundToOneDecimal(stats._avg.rating ?? 0), reviewCount: stats._count._all },
    });
  }

  /**
   * A HomeKrafter's rating spans direct storefront reviews *and* every
   * review of something they make. Both are "what people think of this
   * kitchen", and counting only the first would leave a storefront with
   * forty product reviews reading as unrated.
   */
  private async applyVendor(db: Prisma.TransactionClient | PrismaService, id: string): Promise<void> {
    const products = await db.product.findMany({ where: { vendorId: id }, select: { id: true } });
    const stats = await db.review.aggregate({
      where: {
        hidden: false,
        OR: [
          { targetType: 'vendor', targetId: id },
          { targetType: 'product', targetId: { in: products.map((p) => p.id) } },
        ],
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const rating = roundToOneDecimal(stats._avg.rating ?? 0);
    const reviewCount = stats._count._all;
    await db.vendor.update({ where: { id }, data: { rating, reviewCount } });
    // `Seller` keeps its own copy for the portal dashboard's rating card.
    await db.seller.updateMany({ where: { vendorId: id }, data: { rating, reviewCount } });
  }
}

/** `Product.rating`/`Vendor.rating` are `Decimal(2,1)` — a raw average overflows the scale. */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
