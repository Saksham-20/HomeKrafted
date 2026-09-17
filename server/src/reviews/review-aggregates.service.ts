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

  /**
   * Recompute for a target, joining an open transaction when one is
   * supplied — and opening one of its own otherwise, because the row lock
   * both `applyProduct`/`applyVendor` take only holds for the life of a
   * transaction. A bare `SELECT ... FOR UPDATE` outside one releases the
   * instant its own statement completes, which protects nothing.
   */
  async recompute(targetType: ReviewTarget, targetId: string, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) {
      await this.recomputeLocked(tx, targetType, targetId);
      return;
    }
    await this.prisma.$transaction((inner) => this.recomputeLocked(inner, targetType, targetId));
  }

  private async recomputeLocked(
    db: Prisma.TransactionClient,
    targetType: ReviewTarget,
    targetId: string,
  ): Promise<void> {
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

  /**
   * `FOR UPDATE` on the `Product` row before the aggregate read, same
   * pattern as `WalletService`/`PaymentsService`'s row-locked read-then-
   * write. Under Postgres's default READ COMMITTED, two reviews written
   * for the same product at once would otherwise both read the aggregate
   * before either write committed, and whichever `product.update` commits
   * last would silently overwrite the other's count with a stale one. The
   * lock serializes them: the second transaction blocks here until the
   * first's update commits, then reads the count it left behind.
   */
  private async applyProduct(db: Prisma.TransactionClient, id: string): Promise<void> {
    await db.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
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
   *
   * Same `FOR UPDATE` reasoning as `applyProduct` — locked on the `Vendor`
   * row, since that (and `Seller`, kept in step with it) is what this
   * function's aggregate read-then-write race would otherwise corrupt.
   */
  private async applyVendor(db: Prisma.TransactionClient, id: string): Promise<void> {
    await db.$queryRaw`SELECT id FROM "Vendor" WHERE id = ${id} FOR UPDATE`;
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
