import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Seller } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { mapPayout } from './mappers/payout.mapper';

/**
 * Payouts — shared by all 3 seller types. Earnings are computed
 * server-side from the seller's own *delivered* orders/bookings/snack
 * orders (never a client-submitted amount — the money-safety rule every
 * wallet/order mutation in this codebase already follows), scoped to
 * `seller.id`/`seller.vendorId` resolved by `SellerService`. `Payout` is
 * its own ledger row here (not a `WalletTransaction`) per the milestone
 * brief — a real payout-provider integration (bank transfer/Razorpay
 * Payouts) is a later-milestone seam; this milestone only records the
 * request.
 */
@Injectable()
export class SellerPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(seller: Seller) {
    const [rows, pendingBalance] = await Promise.all([
      this.prisma.payout.findMany({ where: { sellerId: seller.id }, orderBy: { periodEnd: 'desc' } }),
      this.getPendingBalance(seller),
    ]);

    const totalPaid = rows.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
    const totalRequestedPending = rows.filter((p) => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      items: rows.map(mapPayout),
      summary: { totalPaid, totalPending: totalRequestedPending, lifetimeEarned: totalPaid + totalRequestedPending },
      pendingBalance,
    };
  }

  async requestPayout(seller: Seller, idempotencyKey?: string) {
    return this.idempotency.run(seller.userId, 'seller.requestPayout', idempotencyKey, async (tx) => {
      const alreadyPending = await tx.payout.findFirst({ where: { sellerId: seller.id, status: 'pending' } });
      if (alreadyPending) {
        throw new ConflictException('A payout request is already pending for this account');
      }

      const [earnings, alreadyRequested, latestPayout] = await Promise.all([
        this.computeDeliveredEarningsTx(tx, seller),
        tx.payout.aggregate({ where: { sellerId: seller.id }, _sum: { amount: true } }),
        tx.payout.findFirst({ where: { sellerId: seller.id }, orderBy: { periodEnd: 'desc' } }),
      ]);

      const pendingBalance = Math.max(0, Math.round((earnings - Number(alreadyRequested._sum.amount ?? 0)) * 100) / 100);
      if (pendingBalance <= 0) {
        throw new BadRequestException('No pending earnings to request a payout for');
      }

      const periodStart = latestPayout ? new Date(latestPayout.periodEnd.getTime() + 24 * 60 * 60 * 1000) : seller.createdAt;
      const periodEnd = new Date();

      const payout = await tx.payout.create({
        data: {
          sellerId: seller.id,
          amount: pendingBalance,
          periodStart,
          periodEnd,
          status: 'pending',
        },
      });
      return mapPayout(payout);
    });
  }

  /** Non-tx read used by the dashboard + `GET /seller/payouts` — "how much would a payout request pay out right now". */
  async getPendingBalance(seller: Seller): Promise<number> {
    const [earnings, alreadyRequested] = await Promise.all([
      this.computeDeliveredEarnings(seller),
      this.prisma.payout.aggregate({ where: { sellerId: seller.id }, _sum: { amount: true } }),
    ]);
    return Math.max(0, Math.round((earnings - Number(alreadyRequested._sum.amount ?? 0)) * 100) / 100);
  }

  private async computeDeliveredEarnings(seller: Seller): Promise<number> {
    return this.computeDeliveredEarningsTx(this.prisma, seller);
  }

  private async computeDeliveredEarningsTx(
    tx: Prisma.TransactionClient | PrismaService,
    seller: Seller,
  ): Promise<number> {
    if (seller.type === 'maker' && seller.vendorId) {
      const items = await tx.orderItem.findMany({
        where: { product: { vendorId: seller.vendorId }, order: { status: 'delivered' } },
        select: { price: true, quantity: true },
      });
      return items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    }
    if (seller.type === 'laundry') {
      const bookings = await tx.laundryBooking.findMany({
        where: { partnerId: seller.id, status: 'delivered' },
        select: { estimatedTotal: true },
      });
      return bookings.reduce((sum, b) => sum + Number(b.estimatedTotal), 0);
    }
    const orders = await tx.snackOrder.findMany({
      where: { sellerId: seller.id, status: 'delivered' },
      select: { total: true },
    });
    return orders.reduce((sum, o) => sum + Number(o.total), 0);
  }
}
