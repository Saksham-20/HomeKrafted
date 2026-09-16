import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RiderPayout, RiderPayoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../audit-log.service';
import { NotificationsDeliveryService } from '../../notifications/notifications-delivery.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { deductionFor } from '../../rider/cash-ledger';
import { ListPayoutsQueryDto } from './dto/list-payouts.query.dto';
import { GeneratePayoutsDto } from './dto/generate-payouts.dto';
import { PayPayoutDto } from './dto/pay-payout.dto';
import { ReasonDto } from './dto/reason.dto';

const DEFAULT_PAGE_SIZE = 25;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapPayout(payout: RiderPayout) {
  return {
    id: payout.id,
    riderId: payout.riderId,
    periodStart: payout.periodStart.toISOString().slice(0, 10),
    periodEnd: payout.periodEnd.toISOString().slice(0, 10),
    earnings: Number(payout.earnings),
    cashDeducted: Number(payout.cashDeducted),
    adjustments: Number(payout.adjustments),
    net: Number(payout.net),
    status: payout.status,
    reference: payout.reference ?? undefined,
    paidAt: payout.paidAt ? payout.paidAt.toISOString() : undefined,
    createdAt: payout.createdAt.toISOString(),
  };
}

/**
 * `/admin/rider-payouts` — §2.4's weekly settlement, generated in a
 * batch and settled one at a time. Same M15 rule as the seller payout
 * queue: **this does not move money.** `generate` computes what each
 * rider is owed and takes their current cash debt out of it; `pay`
 * records that a transfer happened out of band, it does not perform one.
 * `finance` scope throughout.
 */
@Injectable()
export class AdminRiderPayoutsService {
  private readonly logger = new Logger(AdminRiderPayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly delivery: NotificationsDeliveryService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(query: ListPayoutsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const status: RiderPayoutStatus = query.status ?? 'pending';

    const [rows, total] = await Promise.all([
      this.prisma.riderPayout.findMany({
        where: { status },
        orderBy: [{ periodEnd: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.riderPayout.count({ where: { status } }),
    ]);

    return { items: rows.map(mapPayout), page, pageSize, total };
  }

  /**
   * `POST /admin/rider-payouts/generate` — one payout per
   * approved rider whose delivered jobs in the window earned something,
   * skipping riders who earned nothing (a zero-row payout tells nobody
   * anything). **Idempotent per rider+period two ways at once**: a
   * `findUnique` on the row's own unique key skips a rider already
   * generated for this exact window before writing anything, and the
   * unique constraint itself is the backstop against two concurrent
   * `generate` calls racing past that check for the same rider — a
   * P2002 there is caught and treated as "somebody else just created
   * this one", not a failure of the whole batch.
   */
  async generate(adminUserId: string, dto: GeneratePayoutsDto, idempotencyKey: string | undefined) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new BadRequestException('periodStart and periodEnd must be valid dates.');
    }
    if (periodEnd <= periodStart) {
      throw new BadRequestException('periodEnd must be after periodStart.');
    }

    const created = await this.idempotency.run(adminUserId, 'admin.rider-payouts.generate', idempotencyKey, async (tx) => {
      const riders = await tx.rider.findMany({ where: { status: 'approved' } });
      const now = new Date();
      const results: ReturnType<typeof mapPayout>[] = [];

      for (const rider of riders) {
        const existing = await tx.riderPayout.findUnique({
          where: { riderId_periodStart_periodEnd: { riderId: rider.id, periodStart, periodEnd } },
        });
        if (existing) continue; // already generated for this rider+period — the idempotent case

        const jobs = await tx.deliveryJob.findMany({
          where: { riderId: rider.id, status: 'delivered', deliveredAt: { gte: periodStart, lte: periodEnd } },
          select: { totalPay: true },
        });
        const earnings = round2(jobs.reduce((sum, j) => sum + Number(j.totalPay ?? 0), 0));
        if (earnings <= 0) continue; // nobody delivered anything billable this period — skip, don't write a zero row

        const entries = await tx.riderCashEntry.findMany({ where: { riderId: rider.id } });
        const pending = await tx.riderDeposit.aggregate({
          where: { riderId: rider.id, status: 'pending' },
          _sum: { amount: true },
        });
        const cashDeducted = deductionFor({
          mode: rider.settlementMode,
          entries: entries.map((e) => ({ amount: Number(e.amount), createdAt: e.createdAt })),
          earnings,
          now,
          pendingDeposits: Number(pending._sum.amount ?? 0),
        });
        const net = round2(earnings - cashDeducted);

        try {
          const payout = await tx.riderPayout.create({
            data: { riderId: rider.id, periodStart, periodEnd, earnings, cashDeducted, adjustments: 0, net, status: 'pending' },
          });

          if (cashDeducted > 0) {
            await tx.riderCashEntry.create({
              data: {
                riderId: rider.id,
                type: 'payout_deduction',
                amount: -cashDeducted,
                payoutId: payout.id,
                note: `Deducted for payout ${payout.id} (${periodStart.toISOString().slice(0, 10)}–${periodEnd.toISOString().slice(0, 10)})`,
                createdById: adminUserId,
              },
            });
          }

          results.push(mapPayout(payout));
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            continue; // a concurrent generate call won this rider+period first
          }
          throw err;
        }
      }

      return results;
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'rider_payout.generate',
      targetType: 'RiderPayout',
      targetId: `${dto.periodStart}..${dto.periodEnd}`,
      metadata: { periodStart: dto.periodStart, periodEnd: dto.periodEnd, count: created.length },
    });

    return created;
  }

  async pay(adminUserId: string, id: string, dto: PayPayoutDto, idempotencyKey: string | undefined) {
    const result = await this.idempotency.run(adminUserId, 'admin.rider-payouts.pay', idempotencyKey, async (tx) => {
      const payout = await tx.riderPayout.findUnique({ where: { id } });
      if (!payout) throw new NotFoundException('Payout not found.');

      const guard = await tx.riderPayout.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'paid', paidAt: new Date(), reference: dto.reference, decidedById: adminUserId },
      });
      if (guard.count !== 1) {
        const current = await tx.riderPayout.findUniqueOrThrow({ where: { id } });
        throw new ConflictException(`This payout has already been ${current.status}.`);
      }

      return mapPayout(await tx.riderPayout.findUniqueOrThrow({ where: { id } }));
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'rider_payout.pay',
      targetType: 'RiderPayout',
      targetId: id,
      metadata: { net: result.net, reference: dto.reference },
    });

    await this.notify(result.riderId, 'Payout sent', `₹${result.net.toFixed(2)} is on its way${dto.reference ? ` (ref ${dto.reference})` : ''}.`, id);

    return result;
  }

  /**
   * `POST .../:id/reject` — reverses the deduction with an `adjustment`
   * entry rather than deleting the `payout_deduction` row: the ledger
   * keeps both the original deduction and its reversal on record, the
   * same "never delete money history" shape as every other ledger in
   * this codebase. Not idempotency-keyed (the brief names only
   * verify/generate/pay) — the guarded `updateMany` already makes a
   * retried reject a no-op 409 rather than a double reversal.
   */
  async reject(adminUserId: string, id: string, dto: ReasonDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.riderPayout.findUnique({ where: { id } });
      if (!payout) throw new NotFoundException('Payout not found.');

      const guard = await tx.riderPayout.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'rejected', decidedById: adminUserId },
      });
      if (guard.count !== 1) {
        const current = await tx.riderPayout.findUniqueOrThrow({ where: { id } });
        throw new ConflictException(`This payout has already been ${current.status}.`);
      }

      if (Number(payout.cashDeducted) > 0) {
        await tx.riderCashEntry.create({
          data: {
            riderId: payout.riderId,
            type: 'adjustment',
            amount: payout.cashDeducted,
            payoutId: payout.id,
            note: `Payout rejected — deduction reversed (${dto.reason})`,
            createdById: adminUserId,
          },
        });
      }

      return mapPayout(await tx.riderPayout.findUniqueOrThrow({ where: { id } }));
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'rider_payout.reject',
      targetType: 'RiderPayout',
      targetId: id,
      metadata: { reason: dto.reason, cashDeducted: result.cashDeducted },
    });

    await this.notify(result.riderId, 'Your payout was rejected', dto.reason, id);

    return result;
  }

  private async notify(riderId: string, title: string, body: string, refId: string): Promise<void> {
    try {
      const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { userId: true } });
      if (!rider) return;
      await this.delivery.deliver({ userId: rider.userId, category: 'account', title, body, refType: 'riderPayout', refId });
    } catch (err) {
      this.logger.warn(`Failed to notify rider about payout ${refId}: ${String(err)}`);
    }
  }
}
