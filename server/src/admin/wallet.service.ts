import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { mapWallet, mapWalletTransaction } from '../wallet/wallet.mapper';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { AdminAuditLogService } from './audit-log.service';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { AdminIssueRefundDto } from './dto/admin-issue-refund.dto';
import { ListAdminWalletsQueryDto } from './dto/list-admin-wallets.query.dto';

function formatInr(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

/**
 * Platform-wide wallet oversight — any user's wallet + transactions.
 * `adjust`/`issueRefund` both funnel through `WalletService`'s
 * row-locked ledger primitives (`adjust()` directly; `issueRefund` via
 * the same `getOrCreateWalletTx`/`postLedgerEntryTx` pair every other
 * money-mutating flow in this codebase uses) — **never a raw
 * `prisma.wallet.update({ data: { balance: ... } })`**. Both also fire a
 * `"wallet"`-category notification (M9, `NotificationsDeliveryService`)
 * to the affected user after the ledger write commits — the concrete,
 * curl-provable "a notification with prefs set fans out to the right
 * channel stubs" proof this milestone's Definition of Done asks for.
 */
const DEFAULT_WALLET_PAGE_SIZE = 25;
const DEFAULT_LEDGER_PAGE_SIZE = 50;

/** Money rounded to paise — a SUM over Decimal columns comes back as a float. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class AdminWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notificationsDelivery: NotificationsDeliveryService,
  ) {}

  /**
   * Platform-wide wallet liability, plus one page of per-user balances.
   *
   * There is one wallet per user, so this read grew with the whole
   * customer base — and the three totals at the top were computed by
   * reducing over the full array in JavaScript. They are aggregates now,
   * and deliberately **not** narrowed by the page: a "total liability"
   * that only totalled the twenty-five wallets on screen would be a
   * platform-wide money figure quietly meaning something else.
   */
  async getOverview(query: ListAdminWalletsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_WALLET_PAGE_SIZE;

    const [wallets, totals, walletCount] = await Promise.all([
      this.prisma.wallet.findMany({
        include: { user: { select: { id: true, name: true } }, _count: { select: { transactions: true } } },
        // `id` breaks the tie: every wallet starts at zero, so without it
        // the first page of a fresh platform is in no particular order and
        // a page boundary repeats one row while dropping another.
        orderBy: [{ balance: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wallet.aggregate({ _sum: { balance: true, lifetimeSaved: true } }),
      this.prisma.wallet.count(),
    ]);

    const balances = wallets.map((w) => ({
      userId: w.userId,
      userName: w.user.name,
      walletId: w.id,
      balance: Number(w.balance),
      pendingCashback: Number(w.pendingCashback),
      lifetimeSaved: Number(w.lifetimeSaved),
      transactionCount: w._count.transactions,
    }));

    return {
      totalLiability: round2(Number(totals._sum.balance ?? 0)),
      walletCount,
      totalLifetimeSaved: round2(Number(totals._sum.lifetimeSaved ?? 0)),
      balances,
      page,
      pageSize,
      total: walletCount,
    };
  }

  /**
   * One user's wallet and a page of their ledger.
   *
   * The same unbounded read the buyer-facing `GET /wallet/transactions`
   * had — every row a wallet has ever accumulated, on a table that only
   * grows. Cursor rather than offset for the same reason: a ledger takes
   * new rows at the end being read from, so an offset page 2 re-shows a
   * row page 1 already displayed the moment anything credits mid-scroll.
   */
  async getUserWallet(userId: string, query: ListAdminWalletsQueryDto = {}) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found for this user');

    const limit = query.limit ?? DEFAULT_LEDGER_PAGE_SIZE;
    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      // `id` after `createdAt` is load-bearing: the transactions one order
      // writes share a timestamp to the millisecond, so `createdAt` alone
      // is not a total order and a cursor over it skips rows.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const transactions = hasMore ? rows.slice(0, limit) : rows;
    return {
      wallet: mapWallet(wallet),
      transactions: transactions.map(mapWalletTransaction),
      nextCursor: hasMore ? transactions[transactions.length - 1].id : null,
    };
  }

  async adjust(adminUserId: string, userId: string, dto: AdminAdjustWalletDto, idempotencyKey?: string) {
    const result = await this.walletService.adjust(
      adminUserId,
      { userId, direction: dto.direction, amount: dto.amount, reason: dto.reason },
      idempotencyKey,
    );

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'wallet.adjust',
      targetType: 'Wallet',
      targetId: result.wallet.id,
      metadata: { userId, direction: dto.direction, amount: dto.amount, reason: dto.reason },
    });

    await this.notificationsDelivery.deliver({
      userId,
      category: 'wallet',
      title: dto.direction === 'credit' ? 'Wallet credited' : 'Wallet debited',
      body: `An admin ${dto.direction === 'credit' ? 'credited' : 'debited'} ${formatInr(dto.amount)} — ${dto.reason}. New balance: ${formatInr(result.balanceAfter)}.`,
      refType: 'walletTransaction',
      refId: result.transactionId,
    });

    return result;
  }

  async issueRefund(adminUserId: string, userId: string, dto: AdminIssueRefundDto, idempotencyKey?: string) {
    const result = await this.idempotency.run(adminUserId, 'admin.wallet.refund', idempotencyKey, async (tx) => {
      const wallet = await this.walletService.getOrCreateWalletTx(tx, userId);
      const { balanceAfter, transactionId } = await this.walletService.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'credit',
        category: 'refund',
        amount: dto.amount,
        title: dto.title,
        refType: dto.refType,
        refId: dto.refId,
      });
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      // `transactionId` included (M9 — closes the M8.4b-flagged shape
      // gap) so the client no longer has to synthesize a fake id.
      return { wallet: mapWallet(updated), balanceAfter, transactionId };
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'wallet.refund',
      targetType: 'Wallet',
      targetId: result.wallet.id,
      metadata: { userId, amount: dto.amount, title: dto.title, refType: dto.refType, refId: dto.refId },
    });

    await this.notificationsDelivery.deliver({
      userId,
      category: 'wallet',
      title: 'Refund credited',
      body: `${dto.title}: ${formatInr(dto.amount)} credited to your wallet. New balance: ${formatInr(result.balanceAfter)}.`,
      refType: 'walletTransaction',
      refId: result.transactionId,
    });

    return result;
  }
}
