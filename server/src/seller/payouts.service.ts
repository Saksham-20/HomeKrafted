import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Seller } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AdminSettingsService } from '../admin/settings.service';
import { computePayoutSplit } from './payout-split';
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
    private readonly settings: AdminSettingsService,
  ) {}

  async list(seller: Seller) {
    const [rows, grossPending, settings] = await Promise.all([
      this.prisma.payout.findMany({ where: { sellerId: seller.id }, orderBy: { periodEnd: 'desc' } }),
      this.grossPending(seller),
      this.settings.get(),
    ]);

    const totalPaid = rows.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
    const totalRequestedPending = rows.filter((p) => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0);

    // What a payout request would actually pay right now, and its
    // arithmetic (M37). While `commissionEnabled` is off the split is an
    // *estimate at the configured rate* and `netPending === grossPending`;
    // the client says which — this is the transparency /terms promised.
    const split = computePayoutSplit(grossPending, settings.commissionPct, settings.commissionEnabled);
    const estimate = computePayoutSplit(grossPending, settings.commissionPct, true);

    return {
      items: rows.map(mapPayout),
      summary: { totalPaid, totalPending: totalRequestedPending, lifetimeEarned: totalPaid + totalRequestedPending },
      pendingBalance: split.amount,
      commission: {
        enabled: settings.commissionEnabled,
        pct: settings.commissionPct,
        grossPending: split.grossAmount,
        commissionOnPending: settings.commissionEnabled ? split.commissionAmount : estimate.commissionAmount,
        netPending: settings.commissionEnabled ? split.amount : estimate.amount,
      },
    };
  }

  async requestPayout(seller: Seller, idempotencyKey?: string) {
    return this.idempotency.run(seller.userId, 'seller.requestPayout', idempotencyKey, async (tx) => {
      // Serialize every payout request for this HomeKrafter against each
      // other, before reading whether one is already pending.
      //
      // The idempotency key above only de-duplicates a *repeat of the same
      // request*. Two genuinely separate requests — a double-click, or two
      // tabs, which send different keys or none — both ran the read below,
      // both saw no pending row, and both created one. `pendingBalance`
      // subtracts the sum of existing payouts, so the second row was
      // ₹0-correct only if the first had already committed; racing, they
      // each claimed the full balance and the HomeKrafter's earnings were
      // requested twice.
      //
      // A lock rather than a partial unique index (`WHERE status='pending'`)
      // because Prisma's schema language cannot express one, so it would
      // live only in raw migration SQL and read as drift on every
      // `migrate dev`. Under READ COMMITTED the loser blocks here until the
      // winner commits, and its next statement takes a fresh snapshot — so
      // the `findFirst` below sees the row the winner just wrote.
      await tx.$queryRaw`SELECT id FROM "Seller" WHERE id = ${seller.id} FOR UPDATE`;

      const alreadyPending = await tx.payout.findFirst({ where: { sellerId: seller.id, status: 'pending' } });
      if (alreadyPending) {
        throw new ConflictException('A payout request is already pending for this account');
      }

      const [earnings, alreadyRequestedGross, latestPayout, settings] = await Promise.all([
        this.computeDeliveredEarningsTx(tx, seller),
        this.sumRequestedGrossTx(tx, seller.id),
        tx.payout.findFirst({ where: { sellerId: seller.id }, orderBy: { periodEnd: 'desc' } }),
        this.settings.get(),
      ]);

      const grossPending = Math.max(0, Math.round((earnings - alreadyRequestedGross) * 100) / 100);
      if (grossPending <= 0) {
        throw new BadRequestException('No pending earnings to request a payout for');
      }

      // The split is computed once, here, and stored on the row (M37):
      // `amount` stays the payable figure, and the three columns beside
      // it say what was deducted at what rate — so a payout from a
      // disabled era reads gross/0/0 rather than looking like a 0% rate
      // was ever decided.
      const split = computePayoutSplit(grossPending, settings.commissionPct, settings.commissionEnabled);

      const periodStart = latestPayout ? new Date(latestPayout.periodEnd.getTime() + 24 * 60 * 60 * 1000) : seller.createdAt;
      const periodEnd = new Date();

      const payout = await tx.payout.create({
        data: {
          sellerId: seller.id,
          amount: split.amount,
          grossAmount: split.grossAmount,
          commissionAmount: split.commissionAmount,
          commissionPct: split.commissionPct,
          periodStart,
          periodEnd,
          status: 'pending',
        },
      });
      return mapPayout(payout);
    });
  }

  /** Non-tx read used by the dashboard + `GET /seller/payouts` — what a payout request would actually pay right now (net when commission is enabled). */
  async getPendingBalance(seller: Seller): Promise<number> {
    const [grossPending, settings] = await Promise.all([this.grossPending(seller), this.settings.get()]);
    return computePayoutSplit(grossPending, settings.commissionPct, settings.commissionEnabled).amount;
  }

  /** Delivered earnings not yet claimed by any payout row, in gross terms. */
  private async grossPending(seller: Seller): Promise<number> {
    const [earnings, alreadyRequestedGross] = await Promise.all([
      this.computeDeliveredEarnings(seller),
      this.sumRequestedGrossTx(this.prisma, seller.id),
    ]);
    return Math.max(0, Math.round((earnings - alreadyRequestedGross) * 100) / 100);
  }

  /**
   * Σ of what previous payouts *claimed from gross earnings* — which is
   * `grossAmount` on M37+ rows and `amount` on older rows, where amount
   * was always gross. Comparing net `amount`s against gross earnings
   * would double-count the deducted commission the moment the flag turns
   * on, and re-offer it as payable.
   */
  private async sumRequestedGrossTx(
    tx: Prisma.TransactionClient | PrismaService,
    sellerId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ total: number | null }[]>`
      SELECT SUM(COALESCE("grossAmount", "amount"))::float8 AS total
      FROM "Payout" WHERE "sellerId" = ${sellerId}
    `;
    return rows[0]?.total ?? 0;
  }

  private async computeDeliveredEarnings(seller: Seller): Promise<number> {
    return this.computeDeliveredEarningsTx(this.prisma, seller);
  }

  private async computeDeliveredEarningsTx(
    tx: Prisma.TransactionClient | PrismaService,
    seller: Seller,
  ): Promise<number> {
    // Sum every stream a HomeKrafter can earn from, rather than picking one
    // by `seller.type`. Under the single-role model the same account can
    // sell jars, run pickups and take WhatsApp snack orders in the same
    // week; paying out only the stream matching a type label would quietly
    // drop the rest of their money.
    // Summed in the database, not in memory. This used to pull **every
    // delivered line item, booking and snack order** a HomeKrafter had
    // ever had onto the heap to add up three numbers — on a table that
    // only grows, on the read behind both the dashboard and the payout
    // request. The marketplace leg needs raw SQL because the quantity it
    // multiplies by is a column, which `aggregate` cannot express;
    // `$queryRaw` runs on the transaction client, so a payout request
    // still reads inside its own transaction.
    const [marketplaceRows, bookings, orders] = await Promise.all([
      tx.$queryRaw<{ total: number | null }[]>`
        SELECT SUM(oi."price" * oi."quantity")::float8 AS total
        FROM "OrderItem" oi
        JOIN "Product" p ON p.id = oi."productId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE p."vendorId" = ${seller.vendorId} AND o."status" = 'delivered'::"OrderStatus"
      `,
      tx.laundryBooking.aggregate({
        where: { partnerId: seller.id, status: 'delivered' },
        _sum: { estimatedTotal: true },
      }),
      tx.snackOrder.aggregate({
        where: { sellerId: seller.id, status: 'delivered' },
        _sum: { total: true },
      }),
    ]);

    // `SUM` over no rows is SQL NULL, not 0 — a HomeKrafter with nothing
    // delivered yet must read as ₹0 earned, never NaN.
    const marketplace = marketplaceRows[0]?.total ?? 0;
    const laundry = Number(bookings._sum.estimatedTotal ?? 0);
    const snacks = Number(orders._sum.total ?? 0);
    return marketplace + laundry + snacks;
  }
}
