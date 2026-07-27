import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { mapWallet, mapWalletTransaction } from '../wallet/wallet.mapper';
import { AdminAuditLogService } from './audit-log.service';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { AdminIssueRefundDto } from './dto/admin-issue-refund.dto';

/**
 * Platform-wide wallet oversight — any user's wallet + transactions.
 * `adjust`/`issueRefund` both funnel through `WalletService`'s
 * row-locked ledger primitives (`adjust()` directly; `issueRefund` via
 * the same `getOrCreateWalletTx`/`postLedgerEntryTx` pair every other
 * money-mutating flow in this codebase uses) — **never a raw
 * `prisma.wallet.update({ data: { balance: ... } })`**.
 */
@Injectable()
export class AdminWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AdminAuditLogService,
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

    return result;
  }

  async issueRefund(adminUserId: string, userId: string, dto: AdminIssueRefundDto, idempotencyKey?: string) {
    const result = await this.idempotency.run(adminUserId, 'admin.wallet.refund', idempotencyKey, async (tx) => {
      const wallet = await this.walletService.getOrCreateWalletTx(tx, userId);
      const { balanceAfter } = await this.walletService.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'credit',
        category: 'refund',
        amount: dto.amount,
        title: dto.title,
        refType: dto.refType,
        refId: dto.refId,
      });
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      return { wallet: mapWallet(updated), balanceAfter };
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'wallet.refund',
      targetType: 'Wallet',
      targetId: result.wallet.id,
      metadata: { userId, amount: dto.amount, title: dto.title, refType: dto.refType, refId: dto.refId },
    });

    return result;
  }
}
