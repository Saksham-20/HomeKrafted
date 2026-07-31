import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditLogService } from './audit-log.service';

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
@Injectable()
export class AdminPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(status?: PayoutStatus) {
    const rows = await this.prisma.payout.findMany({
      where: status ? { status } : undefined,
      include: PAYOUT_INCLUDE,
      // Pending first regardless of the filter: this screen is a queue,
      // and the oldest unanswered request is the one that matters.
      orderBy: [{ status: 'asc' }, { periodEnd: 'desc' }],
    });

    const items = rows.map(mapAdminPayout);
    const pending = items.filter((p) => p.status === 'pending');
    return {
      items,
      summary: {
        pendingCount: pending.length,
        pendingTotal: pending.reduce((sum, p) => sum + p.amount, 0),
        paidTotal: items.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
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

    const updated = await this.prisma.payout.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        reference,
        note,
        decidedById: adminUserId,
        decidedAt: new Date(),
      },
      include: PAYOUT_INCLUDE,
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

    const updated = await this.prisma.payout.update({
      where: { id },
      data: { status: 'rejected', note, decidedById: adminUserId, decidedAt: new Date() },
      include: PAYOUT_INCLUDE,
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
   * Both decisions are one-way. Re-deciding a settled payout would let an
   * admin quietly rewrite a row that says real money moved; the correct
   * fix for a mistake is a new payout, which leaves both facts on record.
   */
  private async requirePending(id: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id }, include: PAYOUT_INCLUDE });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'pending') {
      throw new ConflictException(`This payout has already been ${payout.status}`);
    }
    return payout;
  }

  /** `NotificationsService.notify` already swallows its own failures — a settlement that happened out of band must not be undone by an inbox write. */
  private async notify(userId: string, title: string, body: string, payoutId: string): Promise<void> {
    await this.notifications.notify({
      userId,
      category: 'wallet',
      title,
      body,
      // `Notification.refType` is a free-form string (unlike
      // `WalletTransaction.refType`'s enum), so this can name what it
      // actually points at.
      refType: 'payout',
      refId: payoutId,
    });
  }
}
