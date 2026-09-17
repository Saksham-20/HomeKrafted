import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Seller } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AdminSettingsService } from '../admin/settings.service';
import { computePayoutSplit, allocateClaimedGross } from './payout-split';
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
 *
 * **Two streams, two rules, since the markup commission model
 * (2026-09-16).** A marketplace `OrderItem` now carries its own split —
 * the buyer paid the commission, not the maker — so marketplace earnings
 * are `COALESCE(sellerAmount, price)` paid **in full**, never run
 * through `computePayoutSplit` again (see `payout-split.ts`'s doc
 * comment for why `sellerAmount IS NULL` legacy rows are read the same
 * way: "fully payable" is the documented one-time transition rule, not a
 * bug). Laundry (withdrawn) and snack (WhatsApp) earnings were never
 * migrated to markup pricing — they're still typed at the maker's
 * sticker price with no fee embedded — so `computePayoutSplit` still
 * applies to that combined "legacy" total, exactly as it did before this
 * model existed.
 */
@Injectable()
export class SellerPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly settings: AdminSettingsService,
  ) {}

  async list(seller: Seller) {
    const [pending, settings] = await Promise.all([this.pendingBreakdown(seller), this.settings.get()]);
    const rows = await this.prisma.payout.findMany({ where: { sellerId: seller.id }, orderBy: { periodEnd: 'desc' } });

    const totalPaid = rows.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
    const totalRequestedPending = rows.filter((p) => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0);

    // The estimate-vs-applied split still only concerns the legacy
    // (laundry/snack) share — a marketplace line's fee is either already
    // embedded in what the buyer paid or (pre-migration, still pending)
    // forgiven, never a function of the switch.
    const legacySplit = computePayoutSplit(
      pending.legacyGross,
      settings.commissionPct,
      settings.commissionEnabled,
      settings.commissionGstPct,
    );
    const legacyEstimate = computePayoutSplit(pending.legacyGross, settings.commissionPct, true, settings.commissionGstPct);

    return {
      items: rows.map(mapPayout),
      summary: { totalPaid, totalPending: totalRequestedPending, lifetimeEarned: totalPaid + totalRequestedPending },
      pendingBalance: round2(pending.marketplaceNet + legacySplit.amount),
      commission: {
        enabled: settings.commissionEnabled,
        pct: settings.commissionPct,
        gstPct: settings.commissionGstPct,
        grossPending: round2(pending.marketplaceGross + pending.legacyGross),
        // What would still be deducted from a payout right now — the
        // legacy share only. A marketplace fee is never deducted here; it
        // was already collected from the buyer at checkout.
        commissionOnPending: settings.commissionEnabled ? legacySplit.commissionAmount : legacyEstimate.commissionAmount,
        gstOnPending: settings.commissionEnabled ? legacySplit.gstAmount : legacyEstimate.gstAmount,
        netPending: round2(pending.marketplaceNet + (settings.commissionEnabled ? legacySplit.amount : legacyEstimate.amount)),
        // Informational only — already collected from buyers on
        // marketplace sales, never deducted from what this payout pays.
        marketplaceCommissionCollected: round2(pending.marketplaceCommissionCollected),
        marketplaceGstCollected: round2(pending.marketplaceGstCollected),
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

      const [pending, latestPayout, settings] = await Promise.all([
        this.pendingBreakdown(seller, tx),
        tx.payout.findFirst({ where: { sellerId: seller.id }, orderBy: { periodEnd: 'desc' } }),
        this.settings.get(),
      ]);

      // The legacy split is computed once, here, and stored on the row
      // (M37): `amount` stays the payable figure, and the three columns
      // beside it say what was deducted at what rate — so a payout from a
      // disabled era, or one with no legacy component at all, reads
      // gross/0/0 rather than looking like a 0% rate was ever decided.
      const legacySplit = computePayoutSplit(
        pending.legacyGross,
        settings.commissionPct,
        settings.commissionEnabled,
        settings.commissionGstPct,
      );
      const amount = round2(pending.marketplaceNet + legacySplit.amount);
      const grossAmount = round2(pending.marketplaceGross + legacySplit.grossAmount);

      if (amount <= 0) {
        throw new BadRequestException('No pending earnings to request a payout for');
      }

      const periodStart = latestPayout ? new Date(latestPayout.periodEnd.getTime() + 24 * 60 * 60 * 1000) : seller.createdAt;
      const periodEnd = new Date();

      const payout = await tx.payout.create({
        data: {
          sellerId: seller.id,
          amount,
          grossAmount,
          // The legacy deduction alone — a marketplace line never has
          // commission taken from the payout itself.
          commissionAmount: legacySplit.commissionAmount,
          commissionPct: legacySplit.commissionPct,
          gstAmount: legacySplit.gstAmount,
          gstPct: legacySplit.gstPct,
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
    const [pending, settings] = await Promise.all([this.pendingBreakdown(seller), this.settings.get()]);
    const legacySplit = computePayoutSplit(
      pending.legacyGross,
      settings.commissionPct,
      settings.commissionEnabled,
      settings.commissionGstPct,
    );
    return round2(pending.marketplaceNet + legacySplit.amount);
  }

  /**
   * The two earnings streams, each netted against what this seller has
   * already claimed in a past payout — marketplace in **net** terms (no
   * further deduction, ever), legacy in **gross** terms (still split by
   * `computePayoutSplit` at request time, exactly as before this model
   * existed).
   *
   * The "already claimed" split is an estimate — see
   * `allocateClaimedGross`'s doc comment for why it has to be, and why
   * the direction it's wrong in is always safe.
   */
  private async pendingBreakdown(
    seller: Seller,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    marketplaceGross: number;
    marketplaceNet: number;
    marketplaceCommissionCollected: number;
    marketplaceGstCollected: number;
    legacyGross: number;
  }> {
    const [everEarned, claimedTotalGross] = await Promise.all([
      this.computeDeliveredEarningsTx(tx, seller),
      this.sumRequestedGrossTx(tx, seller.id),
    ]);

    const { marketplace: marketplaceClaimed, legacy: legacyClaimed } = allocateClaimedGross(
      claimedTotalGross,
      everEarned.marketplaceGross,
    );

    // A marketplace line's net/gross ratio isn't constant (the rate can
    // change over time), so the claimed *net* is read off the same
    // proportion of the claimed *gross* rather than re-derived from
    // today's rate — an already-settled payout must not be recomputed
    // against a rate that came later.
    const marketplaceNetRatio = everEarned.marketplaceGross > 0 ? everEarned.marketplaceNet / everEarned.marketplaceGross : 0;
    const marketplaceClaimedNet = marketplaceClaimed * marketplaceNetRatio;
    const commissionRatio = everEarned.marketplaceGross > 0 ? everEarned.marketplaceCommission / everEarned.marketplaceGross : 0;
    const gstRatio = everEarned.marketplaceGross > 0 ? everEarned.marketplaceGst / everEarned.marketplaceGross : 0;

    const marketplaceGrossPending = Math.max(0, round2(everEarned.marketplaceGross - marketplaceClaimed));
    const marketplaceNetPending = Math.max(0, round2(everEarned.marketplaceNet - marketplaceClaimedNet));

    return {
      marketplaceGross: marketplaceGrossPending,
      marketplaceNet: marketplaceNetPending,
      // Informational split of the pending marketplace gross, at the
      // same proportion as the lifetime figures — for the "already
      // collected from buyers" line on the payout screen, never for
      // deducting anything.
      marketplaceCommissionCollected: marketplaceGrossPending * commissionRatio,
      marketplaceGstCollected: marketplaceGrossPending * gstRatio,
      legacyGross: Math.max(0, round2(everEarned.legacyGross - legacyClaimed)),
    };
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

  private async computeDeliveredEarningsTx(
    tx: Prisma.TransactionClient | PrismaService,
    seller: Seller,
  ): Promise<{
    marketplaceGross: number;
    marketplaceNet: number;
    marketplaceCommission: number;
    marketplaceGst: number;
    legacyGross: number;
  }> {
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
      // Two line shapes, one vendor's earnings. An ordinary line's product
      // carries `vendorId` directly; a hamper line's `productId` is NULL
      // (it points at a `Hamper` instead — `hamperId`), so the plain join
      // below always missed it, and a HomeKrafter's hamper sales could
      // never be requested or paid out even once delivered. `POST
      // /cart/hamper-items` still gates a hamper to one maker across all
      // its `HamperItem` rows (CLAUDE.md's "the hamper path is gated too"
      // — every `HamperItem` shares one vendor by construction), so any
      // one of them naming this vendor is enough to claim the line —
      // there is no "first item" ambiguity to resolve.
      tx.$queryRaw<{ gross: number | null; net: number | null; commission: number | null; gst: number | null }[]>`
        SELECT
          SUM(gross)::float8 AS gross,
          SUM(net)::float8 AS net,
          SUM(commission)::float8 AS commission,
          SUM(gst)::float8 AS gst
        FROM (
          SELECT
            oi."price" * oi."quantity" AS gross,
            COALESCE(oi."sellerAmount", oi."price") * oi."quantity" AS net,
            COALESCE(oi."commissionAmount", 0) * oi."quantity" AS commission,
            COALESCE(oi."gstAmount", 0) * oi."quantity" AS gst
          FROM "OrderItem" oi
          JOIN "Product" p ON p.id = oi."productId"
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE p."vendorId" = ${seller.vendorId} AND o."status" = 'delivered'::"OrderStatus"

          UNION ALL

          SELECT
            oi."price" * oi."quantity" AS gross,
            COALESCE(oi."sellerAmount", oi."price") * oi."quantity" AS net,
            COALESCE(oi."commissionAmount", 0) * oi."quantity" AS commission,
            COALESCE(oi."gstAmount", 0) * oi."quantity" AS gst
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE oi."hamperId" IS NOT NULL
            AND o."status" = 'delivered'::"OrderStatus"
            AND EXISTS (
              SELECT 1 FROM "HamperItem" hi
              JOIN "Product" hp ON hp.id = hi."productId"
              WHERE hi."hamperId" = oi."hamperId" AND hp."vendorId" = ${seller.vendorId}
            )
        ) AS lines
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
    const marketplace = marketplaceRows[0];
    const laundry = Number(bookings._sum.estimatedTotal ?? 0);
    const snacks = Number(orders._sum.total ?? 0);
    return {
      marketplaceGross: marketplace?.gross ?? 0,
      marketplaceNet: marketplace?.net ?? 0,
      marketplaceCommission: marketplace?.commission ?? 0,
      marketplaceGst: marketplace?.gst ?? 0,
      legacyGross: laundry + snacks,
    };
  }
}

/** Money rounded to paise — matches `payout-split.ts`'s own rule. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
