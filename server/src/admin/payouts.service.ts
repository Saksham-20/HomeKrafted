import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { AdminAuditLogService } from './audit-log.service';
import { ListAdminPayoutsQueryDto } from './dto/list-admin-payouts.query.dto';

const PAYOUT_INCLUDE = {
  seller: { include: { user: { select: { id: true, name: true, email: true, phone: true } }, vendor: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.PayoutInclude;

type PayoutRow = Prisma.PayoutGetPayload<{ include: typeof PAYOUT_INCLUDE }>;

function mapAdminPayout(payout: PayoutRow) {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    sellerName: payout.seller.displayName,
    vendorName: payout.seller.vendor.name,
    sellerEmail: payout.seller.user.email ?? undefined,
    sellerPhone: payout.seller.user.phone ?? undefined,
    amount: Number(payout.amount),
    // M37 — the row's own arithmetic; absent on pre-M37 rows where
    // `amount` was always gross.
    grossAmount: payout.grossAmount !== null ? Number(payout.grossAmount) : undefined,
    commissionAmount: payout.commissionAmount !== null ? Number(payout.commissionAmount) : undefined,
    commissionPct: payout.commissionPct !== null ? Number(payout.commissionPct) : undefined,
    periodStart: payout.periodStart.toISOString().slice(0, 10),
    periodEnd: payout.periodEnd.toISOString().slice(0, 10),
    status: payout.status,
    paidAt: payout.paidAt ? payout.paidAt.toISOString() : undefined,
    reference: payout.reference ?? undefined,
    note: payout.note ?? undefined,
    decidedByName: payout.decidedBy?.name ?? undefined,
    decidedAt: payout.decidedAt ? payout.decidedAt.toISOString() : undefined,
  };
}

/**
 * The other end of `SellerPayoutsService.requestPayout` (M8.3b).
 *
 * Between M8.3b and M15 a HomeKrafter could request a payout and nothing
 * on the platform could ever act on it: no admin controller, no screen,
 * no transition out of `pending`. Earnings accrued from delivered orders
 * and had no way to leave. That is the single gap that most obviously
 * blocked a real launch, since it is the platform's promise to its supply
 * side.
 *
 * **This does not move money.** There is no payout-provider integration
 * (bank transfer / Razorpay Payouts); an admin settles out of band and
 * records what they did, including the transfer `reference`. Pretending
 * otherwise — auto-crediting something, or implying a transfer this
 * system never made — would be worse than the honest ledger this keeps.
 */
const DEFAULT_PAYOUT_PAGE_SIZE = 25;

/** Money rounded to paise — a SUM over a Decimal column comes back as a float. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class AdminPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notifications: NotificationsDeliveryService,
  ) {}

  /**
   * The payout queue, one page, with the totals that head it.
   *
   * **The summary counts every payout, never the page or the filter.** It
   * used to be reduced over whatever rows had been loaded, so clicking
   * "Paid" made the header report `pendingCount: 0, pendingTotal: ₹0` —
   * a payouts screen saying nobody is owed anything while three
   * HomeKrafters waited on ₹14,010. Confirmed against a running server
   * during the 2026-08-07 audit, on the one screen in the panel that is
   * entirely about money somebody is waiting for.
   */
  async list(status: PayoutStatus | undefined, query: ListAdminPayoutsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAYOUT_PAGE_SIZE;
    const where = status ? { status } : undefined;

    const [rows, total, pendingAgg, paidAgg] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        include: PAYOUT_INCLUDE,
        // Pending first regardless of the filter: this screen is a queue,
        // and the oldest unanswered request is the one that matters.
        // `id` last, because several payouts share a `periodEnd` by
        // construction — they are cut for the same fortnight.
        orderBy: [{ status: 'asc' }, { periodEnd: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payout.count({ where }),
      this.prisma.payout.aggregate({ where: { status: 'pending' }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.payout.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
    ]);

    return {
      items: rows.map(mapAdminPayout),
      page,
      pageSize,
      total,
      summary: {
        pendingCount: pendingAgg._count._all,
        pendingTotal: round2(Number(pendingAgg._sum.amount ?? 0)),
        paidTotal: round2(Number(paidAgg._sum.amount ?? 0)),
      },
    };
  }

  async getById(id: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id }, include: PAYOUT_INCLUDE });
    if (!payout) throw new NotFoundException('Payout not found');
    return mapAdminPayout(payout);
  }

  async markPaid(adminUserId: string, id: string, reference?: string, note?: string) {
    const payout = await this.requirePending(id);

    const updated = await this.claimPending(id, {
      status: 'paid',
      paidAt: new Date(),
      reference,
      note,
      decidedById: adminUserId,
      decidedAt: new Date(),
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'payout.paid',
      targetType: 'Payout',
      targetId: id,
      metadata: { amount: Number(payout.amount), sellerId: payout.sellerId, reference },
    });

    // The HomeKrafter is the one waiting on this. Notification failures
    // must not undo a settlement that already happened out of band.
    await this.notify(
      payout.seller.userId,
      'Payout sent',
      `₹${Number(payout.amount).toFixed(2)} is on its way${reference ? ` (ref ${reference})` : ''}.`,
      id,
    );

    return mapAdminPayout(updated);
  }

  async reject(adminUserId: string, id: string, note: string) {
    const payout = await this.requirePending(id);

    const updated = await this.claimPending(id, {
      status: 'rejected',
      note,
      decidedById: adminUserId,
      decidedAt: new Date(),
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'payout.rejected',
      targetType: 'Payout',
      targetId: id,
      metadata: { amount: Number(payout.amount), sellerId: payout.sellerId, note },
    });

    await this.notify(payout.seller.userId, 'Payout request declined', note, id);

    return mapAdminPayout(updated);
  }

  /**
   * Applies a decision **only if the payout is still `pending`**, and
   * reports a conflict when it is not.
   *
   * `requirePending` reads, then this writes — and between those two
   * statements another admin can decide the same payout. Both then passed
   * the check and both updated unconditionally: the second overwrote the
   * first's `reference`, `decidedById` and `decidedAt`, so a payout paid by
   * one admin under one UTR could end up on record as rejected by another,
   * or as paid under a reference nobody sent. The row is the only link to a
   * transfer that happened outside this system (see `Payout.reference`), so
   * losing that write is losing the money's paper trail.
   *
   * `updateMany` puts the status into the WHERE clause, which Postgres
   * evaluates against the row it locks — so exactly one of two racing
   * admins matches a row, and the loser gets a 409 naming the outcome that
   * won rather than silently clobbering it.
   */
  private async claimPending(id: string, data: Prisma.PayoutUncheckedUpdateManyInput & { status: PayoutStatus }) {
    const { count } = await this.prisma.payout.updateMany({
      where: { id, status: 'pending' },
      data,
    });
    if (count === 0) {
      // Lost the race — re-read to say what it actually became.
      const current = await this.prisma.payout.findUnique({ where: { id } });
      throw new ConflictException(
        current
          ? `This payout has already been ${current.status}`
          : 'Payout not found',
      );
    }
    return this.prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
  }

  /**
   * Both decisions are one-way. Re-deciding a settled payout would let an
   * admin quietly rewrite a row that says real money moved; the correct
   * fix for a mistake is a new payout, which leaves both facts on record.
   *
   * This is the *fast* check — it produces the friendly 409 for the common
   * case and loads the seller for the notification. `claimPending` is what
   * actually makes the decision safe under concurrency.
   */
  private async requirePending(id: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id }, include: PAYOUT_INCLUDE });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'pending') {
      throw new ConflictException(`This payout has already been ${payout.status}`);
    }
    return payout;
  }

  /**
   * Multi-channel per the account's preferences (M37 — "your payout is
   * on its way" used to be in-app only, which for money on the move is
   * the one message most worth an SMS). Failures are swallowed: a
   * settlement that happened out of band must not be undone by a
   * message.
   */
  private async notify(userId: string, title: string, body: string, payoutId: string): Promise<void> {
    await this.notifications
      .deliver({
        userId,
        category: 'wallet',
        title,
        body,
        // `Notification.refType` is a free-form string (unlike
        // `WalletTransaction.refType`'s enum), so this can name what it
        // actually points at.
        refType: 'payout',
        refId: payoutId,
      })
      .catch(() => undefined);
  }
}
