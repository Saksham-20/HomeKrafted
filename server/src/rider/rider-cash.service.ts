import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderOnboardingService } from './rider.service';
import { RiderSettingsService } from './rider-settings.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { SetSettlementModeDto } from './dto/set-settlement-mode.dto';
import { ListEarningsQueryDto } from './dto/list-earnings.query.dto';
import { ListCashEntriesQueryDto } from './dto/list-cash-entries.query.dto';
import { depositableAmount, isCodBlocked } from './cash-ledger';
import { mapEarningsJobForRider } from './rider-jobs.mapper';
import { JOB_WITH_RELATIONS_INCLUDE } from './rider-jobs.types';

const DEFAULT_ENTRIES_PAGE_SIZE = 20;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * §2.4's cash & payouts screens, the rider's own side — `GET /rider/cash`,
 * `POST /rider/cash/deposits`, `PUT /rider/settlement-mode` and
 * `GET /rider/earnings`. The admin side (verify/reject a deposit,
 * generate/pay/reject a payout, the cash-limit adjustment) lives in
 * `src/admin/riders/` — this file never writes a `deposit`,
 * `payout_deduction` or `adjustment` ledger entry; only `cod_collected`
 * (already written in R2's `RiderJobsService.deliver`) originates here,
 * and only indirectly, by reading it.
 */
@Injectable()
export class RiderCashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riders: RiderOnboardingService,
    private readonly settings: RiderSettingsService,
  ) {}

  private async balance(riderId: string): Promise<number> {
    const result = await this.prisma.riderCashEntry.aggregate({ where: { riderId }, _sum: { amount: true } });
    return round2(Number(result._sum.amount ?? 0));
  }

  async getCash(user: RequestUser, query: ListCashEntriesQueryDto) {
    const rider = await this.riders.resolveRider(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_ENTRIES_PAGE_SIZE;

    const [balance, pendingDeposits, entryRows, entryCount, companyUpiId] = await Promise.all([
      this.balance(rider.id),
      this.prisma.riderDeposit.findMany({
        where: { riderId: rider.id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.riderCashEntry.findMany({
        where: { riderId: rider.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.riderCashEntry.count({ where: { riderId: rider.id } }),
      this.settings.getCompanyUpiId(),
    ]);

    const limit = Number(rider.cashLimit);

    return {
      balance,
      limit,
      codBlocked: isCodBlocked(balance, limit),
      settlementMode: rider.settlementMode,
      pendingDeposits: pendingDeposits.map((d) => ({
        id: d.id,
        amount: Number(d.amount),
        utr: d.utr,
        createdAt: d.createdAt.toISOString(),
      })),
      entries: {
        items: entryRows.map((e) => ({
          id: e.id,
          type: e.type,
          amount: Number(e.amount),
          note: e.note ?? undefined,
          createdAt: e.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total: entryCount,
      },
      // `null` (nothing set on `/admin/settings` yet) — the app hides the
      // pay button and says "Ask support how to deposit" instead of
      // rendering a placeholder VPA nobody should actually pay.
      companyUpiId,
    };
  }

  /**
   * `POST /rider/cash/deposits` — pending only, **no ledger entry yet**
   * (D10/R3's brief: the `deposit` row is written only once an admin
   * verifies it, in the same transaction as the status flip — see
   * `AdminRiderDepositsService.verify`). A rider cannot deposit more than
   * they currently owe; the UTR's own DB-level uniqueness catches a
   * duplicate submission as a 409 rather than a second admin having to
   * notice the same payment claimed twice.
   */
  async createDeposit(user: RequestUser, dto: CreateDepositDto) {
    const rider = await this.riders.resolveRider(user);
    const balance = await this.balance(rider.id);
    const pending = await this.prisma.riderDeposit.aggregate({
      where: { riderId: rider.id, status: 'pending' },
      _sum: { amount: true },
    });
    const pendingSum = Number(pending._sum.amount ?? 0);
    const depositable = depositableAmount(balance, pendingSum);

    // Two pending deposits must not add up to more than is owed: each one
    // alone passed the old check, and verifying both paid us twice.
    if (dto.amount > depositable) {
      throw new BadRequestException(
        pendingSum > 0
          ? `You can deposit up to ₹${depositable.toFixed(2)} — ₹${pendingSum.toFixed(2)} you already sent is still being checked.`
          : `You can't deposit more than you currently owe (₹${balance.toFixed(2)}).`,
      );
    }

    try {
      const deposit = await this.prisma.riderDeposit.create({
        data: { riderId: rider.id, amount: dto.amount, utr: dto.utr },
      });
      return {
        id: deposit.id,
        amount: Number(deposit.amount),
        utr: deposit.utr,
        status: deposit.status,
        createdAt: deposit.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This UTR has already been submitted — check your deposit history.');
      }
      throw err;
    }
  }

  async setSettlementMode(user: RequestUser, dto: SetSettlementModeDto) {
    const rider = await this.riders.resolveRider(user);
    const updated = await this.prisma.rider.update({
      where: { id: rider.id },
      data: { settlementMode: dto.mode },
    });
    return { settlementMode: updated.settlementMode };
  }

  /**
   * `GET /rider/earnings?from&to` — per-job pay rows for delivered jobs
   * in the window, plus the running total and this rider's payout
   * history. `from`/`to` bound `deliveredAt`, the same column a payout
   * period is cut on, so this screen and an admin's generated payout
   * describe the same jobs when the dates line up.
   */
  async earnings(user: RequestUser, query: ListEarningsQueryDto) {
    const rider = await this.riders.resolveRider(user);

    const deliveredAt: Prisma.DateTimeFilter = {};
    if (query.from) deliveredAt.gte = new Date(query.from);
    if (query.to) deliveredAt.lte = new Date(query.to);

    const jobs = await this.prisma.deliveryJob.findMany({
      where: { riderId: rider.id, status: 'delivered', ...(query.from || query.to ? { deliveredAt } : {}) },
      orderBy: { deliveredAt: 'desc' },
      include: JOB_WITH_RELATIONS_INCLUDE,
    });

    const payouts = await this.prisma.riderPayout.findMany({
      where: { riderId: rider.id },
      orderBy: { periodStart: 'desc' },
    });

    const totalEarnings = round2(jobs.reduce((sum, job) => sum + Number(job.totalPay ?? 0), 0));

    return {
      jobs: jobs.map(mapEarningsJobForRider),
      totals: {
        jobCount: jobs.length,
        totalEarnings,
      },
      payouts: payouts.map((p) => ({
        id: p.id,
        periodStart: p.periodStart.toISOString().slice(0, 10),
        periodEnd: p.periodEnd.toISOString().slice(0, 10),
        earnings: Number(p.earnings),
        cashDeducted: Number(p.cashDeducted),
        adjustments: Number(p.adjustments),
        net: Number(p.net),
        status: p.status,
        reference: p.reference ?? undefined,
        paidAt: p.paidAt ? p.paidAt.toISOString() : undefined,
      })),
    };
  }
}
