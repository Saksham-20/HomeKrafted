import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RiderDepositStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../audit-log.service';
import { NotificationsDeliveryService } from '../../notifications/notifications-delivery.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { ListDepositsQueryDto } from './dto/list-deposits.query.dto';
import { ReasonDto } from './dto/reason.dto';

const DEFAULT_PAGE_SIZE = 25;

function mapDeposit(deposit: {
  id: string;
  riderId: string;
  amount: unknown;
  utr: string;
  status: RiderDepositStatus;
  note: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: deposit.id,
    riderId: deposit.riderId,
    amount: Number(deposit.amount),
    utr: deposit.utr,
    status: deposit.status,
    note: deposit.note ?? undefined,
    decidedAt: deposit.decidedAt ? deposit.decidedAt.toISOString() : undefined,
    createdAt: deposit.createdAt.toISOString(),
  };
}

/**
 * `/admin/rider-deposits` — D10's admin half. `scope: 'finance'`
 * (deliberately not `riders`: this is money leaving/entering the
 * ledger, the same reasoning that puts the seller payout queue under
 * `finance` rather than `sellers`).
 */
@Injectable()
export class AdminRiderDepositsService {
  private readonly logger = new Logger(AdminRiderDepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly delivery: NotificationsDeliveryService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(query: ListDepositsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const status = query.status ?? 'pending';

    const [rows, total] = await Promise.all([
      this.prisma.riderDeposit.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.riderDeposit.count({ where: { status } }),
    ]);

    return { items: rows.map(mapDeposit), page, pageSize, total };
  }

  /**
   * `POST /admin/rider-deposits/:id/verify` — the deposit's `pending →
   * verified` flip and its `RiderCashEntry` (`type: 'deposit'`, negative
   * — the ledger's sign convention, `cash-ledger.ts`) happen in the same
   * transaction: a verify that recorded the status change but not the
   * entry (or the reverse) would leave the balance and the deposit
   * disagreeing about whether this money was ever accounted for.
   * `Idempotency-Key`-guarded so a retried click can't write the entry
   * twice.
   */
  async verify(adminUserId: string, id: string, idempotencyKey: string | undefined) {
    const result = await this.idempotency.run(adminUserId, 'admin.rider-deposits.verify', idempotencyKey, async (tx) => {
      const deposit = await tx.riderDeposit.findUnique({ where: { id } });
      if (!deposit) throw new NotFoundException('Deposit not found.');

      const guard = await tx.riderDeposit.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'verified', decidedById: adminUserId, decidedAt: new Date() },
      });
      if (guard.count !== 1) {
        const current = await tx.riderDeposit.findUniqueOrThrow({ where: { id } });
        throw new ConflictException(`This deposit is already "${current.status}".`);
      }

      await tx.riderCashEntry.create({
        data: {
          riderId: deposit.riderId,
          type: 'deposit',
          amount: deposit.amount.negated(),
          depositId: deposit.id,
          note: `Deposit verified (UTR ${deposit.utr})`,
          createdById: adminUserId,
        },
      });

      const updated = await tx.riderDeposit.findUniqueOrThrow({ where: { id } });
      return mapDeposit(updated);
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'rider_deposit.verify',
      targetType: 'RiderDeposit',
      targetId: id,
      metadata: { amount: result.amount, riderId: result.riderId },
    });

    await this.notify(result.riderId, 'Your deposit was verified', `₹${result.amount.toFixed(2)} has been taken off your cash balance.`, id);

    return result;
  }

  async reject(adminUserId: string, id: string, dto: ReasonDto) {
    const deposit = await this.prisma.riderDeposit.findUnique({ where: { id } });
    if (!deposit) throw new NotFoundException('Deposit not found.');

    const guard = await this.prisma.riderDeposit.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'rejected', note: dto.reason, decidedById: adminUserId, decidedAt: new Date() },
    });
    if (guard.count !== 1) {
      throw new ConflictException(`This deposit is already "${deposit.status}".`);
    }

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'rider_deposit.reject',
      targetType: 'RiderDeposit',
      targetId: id,
      metadata: { reason: dto.reason, riderId: deposit.riderId },
    });

    await this.notify(deposit.riderId, 'Your deposit could not be verified', dto.reason, id);

    return mapDeposit(await this.prisma.riderDeposit.findUniqueOrThrow({ where: { id } }));
  }

  /** Never throws into a caller — a decision that already happened (or didn't) must not be undone by a failed message. */
  private async notify(riderId: string, title: string, body: string, refId: string): Promise<void> {
    try {
      const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { userId: true } });
      if (!rider) return;
      await this.delivery.deliver({ userId: rider.userId, category: 'account', title, body, refType: 'riderDeposit', refId });
    } catch (err) {
      this.logger.warn(`Failed to notify rider about deposit ${refId}: ${String(err)}`);
    }
  }
}
