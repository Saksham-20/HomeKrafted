import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Wallet, WalletTransactionCategory, WalletTransactionDirection, WalletTransactionRefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { SetAutoTopupDto } from './dto/set-auto-topup.dto';
import { autoTopupTriggerToDb, mapAutoTopupRule, mapWallet, mapWalletTransaction } from './wallet.mapper';

/** Top-ups above this amount earn a 3% bonus credit — exact port of `client/lib/wallet/WalletContext.tsx`'s `TOPUP_BONUS_THRESHOLD`/`TOPUP_BONUS_RATE`. */
export const TOPUP_BONUS_THRESHOLD = 2000;
export const TOPUP_BONUS_RATE = 0.03;

export interface LedgerRef {
  title: string;
  refType?: WalletTransactionRefType;
  refId?: string;
}

export interface PostLedgerEntryOptions extends LedgerRef {
  walletId: string;
  direction: WalletTransactionDirection;
  category: WalletTransactionCategory;
  amount: number;
  /** Added to `Wallet.lifetimeSaved` alongside the balance write — only `earnCashback`/order-cashback credits use this; a top-up bonus or a refund does not count as a "saving" (mirrors the mock's `earnCashback` vs `topUp`/`refund`). */
  lifetimeSavedDelta?: number;
  /** Internal — set when appending the auto-top-up credit itself, so it can't recursively re-trigger (it's a credit, so this is defense-in-depth, not a real recursion risk). */
  skipAutoTopupCheck?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Server-authoritative wallet ledger — every balance mutation in this
 * codebase (top-up credit, wallet-pay debit, cashback credit, refund
 * credit, admin adjustment) funnels through `postLedgerEntryTx`, the one
 * place that locks the `Wallet` row, computes `balanceAfter` server-side,
 * and appends the `WalletTransaction` — atomically, inside a caller-
 * supplied `Prisma.TransactionClient`.
 *
 * Two method tiers, by design:
 * - `*Tx` methods take an open `tx` and never call `$transaction`
 *   themselves — they're the composable primitives other modules
 *   (`OrdersService`, `PaymentsService`) call from *inside* their own
 *   transaction (often already wrapped by `IdempotencyService.run`), so a
 *   wallet debit and an order-status transition land in one atomic unit.
 * - Plain methods (`getWallet`, `adjust`, ...) are the top-level entry
 *   points `WalletController` calls directly; they open their own
 *   transaction (via `IdempotencyService.run` where a client-supplied
 *   idempotency key applies).
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return mapWallet(wallet);
  }

  async getTransactions(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapWalletTransaction);
  }

  async getAutoTopup(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const rule = await this.prisma.autoTopupRule.findUnique({ where: { walletId: wallet.id } });
    if (rule) return mapAutoTopupRule(rule);
    // No rule persisted yet — same "off by default, below-threshold shape"
    // as the mock's `defaultAutoTopupRule` (`client/lib/data/wallet.ts`),
    // returned without writing a row until the shopper actually saves one
    // via `PUT /wallet/auto-topup`.
    return {
      id: '',
      walletId: wallet.id,
      enabled: false,
      trigger: 'below-threshold' as const,
      thresholdAmount: undefined,
      topupAmount: 0,
    };
  }

  async setAutoTopup(userId: string, dto: SetAutoTopupDto) {
    const wallet = await this.getOrCreateWallet(userId);
    const existing = await this.prisma.autoTopupRule.findUnique({ where: { walletId: wallet.id } });

    const data = {
      enabled: dto.enabled ?? existing?.enabled ?? false,
      trigger: dto.trigger ? autoTopupTriggerToDb(dto.trigger) : (existing?.trigger ?? ('below_threshold' as const)),
      thresholdAmount: dto.thresholdAmount ?? (existing ? Number(existing.thresholdAmount ?? 0) : 0),
      topupAmount: dto.topupAmount ?? (existing ? Number(existing.topupAmount) : 0),
      paymentMethodRef: dto.paymentMethodRef ?? existing?.paymentMethodRef ?? undefined,
    };

    const rule = existing
      ? await this.prisma.autoTopupRule.update({ where: { walletId: wallet.id }, data })
      : await this.prisma.autoTopupRule.create({ data: { walletId: wallet.id, ...data } });

    return mapAutoTopupRule(rule);
  }

  // ---------------------------------------------------------------------
  // Admin — manual adjustment (money-safety exception: caller-supplied
  // amount is intentional here, gated `@Roles('admin')` at the controller)
  // ---------------------------------------------------------------------

  async adjust(adminUserId: string, dto: AdjustWalletDto, idempotencyKey?: string) {
    return this.idempotency.run(adminUserId, 'wallet.adjust', idempotencyKey, async (tx) => {
      const wallet = await this.getOrCreateWalletTx(tx, dto.userId);
      const { balanceAfter, transactionId } = await this.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: dto.direction,
        category: 'adjustment',
        amount: dto.amount,
        title: `Admin adjustment — ${dto.reason}`,
      });
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      // `transactionId` included (M9 — closes the M8.4b-flagged shape
      // gap) so `client/lib/api/admin.ts#adjustWallet` no longer has to
      // synthesize a fake id for the `WalletTransaction` it hands back
      // to its caller.
      return { wallet: mapWallet(updated), balanceAfter, transactionId };
    });
  }

  // ---------------------------------------------------------------------
  // Tx-scoped primitives — composable by other modules within their own
  // open transaction. Never call `this.prisma.$transaction` themselves.
  // ---------------------------------------------------------------------

  async getOrCreateWalletTx(tx: Prisma.TransactionClient, userId: string): Promise<Wallet> {
    const existing = await tx.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return tx.wallet.create({ data: { userId } });
  }

  /**
   * The one place `Wallet.balance`/`WalletTransaction.balanceAfter` are
   * ever written. Locks the wallet row with `SELECT ... FOR UPDATE` (via
   * the open `tx`) before reading the current balance, so two concurrent
   * mutations against the same wallet can't both read-modify-write from
   * the same stale balance — the second waits for the first's row lock to
   * release (transaction commit/rollback) and then computes from the
   * post-first-write balance. Rejects a debit that would take the balance
   * negative with `402 Payment Required` — no partial/negative balance is
   * ever possible.
   */
  async postLedgerEntryTx(
    tx: Prisma.TransactionClient,
    opts: PostLedgerEntryOptions,
  ): Promise<{ balanceAfter: number; transactionId: string }> {
    const amount = round2(opts.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Wallet ledger amount must be a positive number');
    }

    // `::text` avoids any ambiguity in how the pg driver would otherwise
    // represent a NUMERIC column across a raw query — parsed with
    // `Number()` below rather than trusted as a native JS number type.
    const rows = await tx.$queryRaw<{ id: string; balance: string }[]>`
      SELECT "id", "balance"::text AS "balance" FROM "Wallet" WHERE "id" = ${opts.walletId} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Wallet not found');
    }
    const currentBalance = Number(rows[0].balance);
    const signedDelta = opts.direction === 'credit' ? amount : -amount;
    const balanceAfter = round2(currentBalance + signedDelta);

    if (opts.direction === 'debit' && balanceAfter < 0) {
      // Plain string body — `AllExceptionsFilter` derives `code` from the
      // HTTP status itself (`402` isn't one of its named cases, so it
      // falls through to `"ERROR"`) and uses this string verbatim as
      // `message`. Passing a nested `{error:{...}}` object here would
      // double-wrap under the filter's own envelope instead.
      throw new HttpException('Wallet balance is insufficient for this payment', HttpStatus.PAYMENT_REQUIRED);
    }

    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: opts.walletId,
        direction: opts.direction,
        category: opts.category,
        amount,
        balanceAfter,
        title: opts.title,
        refType: opts.refType,
        refId: opts.refId,
      },
    });

    await tx.wallet.update({
      where: { id: opts.walletId },
      data: {
        balance: balanceAfter,
        ...(opts.lifetimeSavedDelta ? { lifetimeSaved: { increment: round2(opts.lifetimeSavedDelta) } } : {}),
      },
    });

    let finalBalance = balanceAfter;
    if (opts.direction === 'debit' && !opts.skipAutoTopupCheck) {
      finalBalance = await this.maybeFireAutoTopupTx(tx, opts.walletId, balanceAfter);
    }

    return { balanceAfter: finalBalance, transactionId: transaction.id };
  }

  /**
   * Fires the wallet's `below-threshold` auto-top-up rule (if enabled)
   * when a debit just dropped the balance under the configured floor —
   * exact mirror of the mock's reactive-only firing (`WalletContext.pay`):
   * never rescues an insufficient debit (that already threw above this
   * ever runs), only tops back up *after* a successful one.
   */
  private async maybeFireAutoTopupTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    balanceAfterDebit: number,
  ): Promise<number> {
    const rule = await tx.autoTopupRule.findUnique({ where: { walletId } });
    if (!rule || !rule.enabled || rule.trigger !== 'below_threshold' || rule.thresholdAmount === null) {
      return balanceAfterDebit;
    }
    const threshold = Number(rule.thresholdAmount);
    if (balanceAfterDebit >= threshold) return balanceAfterDebit;

    const topupAmount = Number(rule.topupAmount);
    if (!(topupAmount > 0)) return balanceAfterDebit;

    const { balanceAfter } = await this.postLedgerEntryTx(tx, {
      walletId,
      direction: 'credit',
      category: 'topup',
      amount: topupAmount,
      title: 'Auto top-up',
      refType: 'topup',
      skipAutoTopupCheck: true,
    });
    return balanceAfter;
  }

  /** Credits a verified Razorpay top-up + its 3% bonus (if the amount clears the threshold) — called only from `PaymentsService.handleWebhook` after HMAC verification, never from a client-trusted "I paid" claim. */
  async creditTopupTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    amount: number,
    ref: { razorpayOrderId: string },
  ): Promise<void> {
    await this.postLedgerEntryTx(tx, {
      walletId,
      direction: 'credit',
      category: 'topup',
      amount,
      title: 'Wallet top-up',
      refType: 'topup',
      refId: ref.razorpayOrderId,
    });

    if (amount > TOPUP_BONUS_THRESHOLD) {
      const bonus = Math.round(amount * TOPUP_BONUS_RATE);
      if (bonus > 0) {
        await this.postLedgerEntryTx(tx, {
          walletId,
          direction: 'credit',
          category: 'cashback',
          amount: bonus,
          title: 'Top-up bonus (3%)',
          refType: 'topup',
          refId: ref.razorpayOrderId,
        });
      }
    }
  }

  /** Non-tx variant of `getOrCreateWalletTx` — for callers (e.g. `PaymentsService.createOrder`) that just need the wallet row's id and aren't already inside an open transaction. */
  async getOrCreateWallet(userId: string): Promise<Wallet> {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { userId } });
  }
}
