import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { mapWallet, mapWalletTransaction } from '../wallet/wallet.mapper';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { AdminAuditLogService } from './audit-log.service';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { AdminIssueRefundDto } from './dto/admin-issue-refund.dto';

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
@Injectable()
export class AdminWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notificationsDelivery: NotificationsDeliveryService,
  ) {}

  async getOverview() {
    const wallets = await this.prisma.wallet.findMany({
      include: { user: { select: { id: true, name: true } }, _count: { select: { transactions: true } } },
      orderBy: { balance: 'desc' },
    });

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
      totalLiability: balances.reduce((sum, b) => sum + b.balance, 0),
      walletCount: balances.length,
      totalLifetimeSaved: balances.reduce((sum, b) => sum + b.lifetimeSaved, 0),
      balances,
    };
  }

  async getUserWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found for this user');
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
    return { wallet: mapWallet(wallet), transactions: transactions.map(mapWalletTransaction) };
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
