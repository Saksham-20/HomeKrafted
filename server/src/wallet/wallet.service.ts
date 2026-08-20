import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Wallet, WalletTransactionCategory, WalletTransactionDirection, WalletTransactionRefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AdminAuditLogService } from '../admin/audit-log.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { SetAutoTopupDto } from './dto/set-auto-topup.dto';
import {
  AUTO_TOPUP_UNAVAILABLE_REASON,
  autoTopupTriggerToDb,
  mapAutoTopupRule,
  mapWallet,
  mapWalletTransaction,
} from './wallet.mapper';

/** Top-ups above this amount earn a 3% bonus credit — exact port of `client/lib/wallet/WalletContext.tsx`'s `TOPUP_BONUS_THRESHOLD`/`TOPUP_BONUS_RATE`. */
export const TOPUP_BONUS_THRESHOLD = 2000;
export const TOPUP_BONUS_RATE = 0.03;

/**
 * Ledger rows returned when a caller names no `limit`. Comfortably more
 * than the six the wallet screen shows before "View full history", so the
 * common case is still one request — the point is the cap, not the number.
 */
const DEFAULT_TRANSACTION_PAGE = 50;

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
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return mapWallet(wallet);
  }

  /**
   * The ledger, newest first, one page at a time.
   *
   * This returned **every row a wallet had ever accumulated**, on a table
   * that only ever grows and that a regular buyer adds to several times
   * per order (debit, cashback, sometimes a refund). Nothing capped it and
   * nothing asked for less: the wallet screen renders six rows and hid the
   * rest behind a "View full history" toggle it had already paid to
   * download.
   *
   * Cursor, not `skip`/`take`, because a ledger takes new rows at the end
   * being read from — an offset page 2 would re-show a row that page 1
   * already displayed the moment cashback lands mid-scroll. The cursor is
   * an id, so it stays correct however many rows appear above it.
   *
   * `id desc` after `createdAt desc` is load-bearing, not decoration:
   * every transaction an order writes shares a timestamp to the
   * millisecond, so `createdAt` alone is not a total order, and a cursor
   * over a non-total order silently skips rows.
   */
  async getTransactions(userId: string, query: ListTransactionsQueryDto = {}) {
    const wallet = await this.getOrCreateWallet(userId);
    const limit = query.limit ?? DEFAULT_TRANSACTION_PAGE;

    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One extra row is how "is there another page" is answered without a
      // second count query over the whole ledger.
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(mapWalletTransaction),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
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
      active: false as const,
      unavailableReason: AUTO_TOPUP_UNAVAILABLE_REASON,
    };
  }

  async setAutoTopup(userId: string, dto: SetAutoTopupDto) {
    // Auto-top-up credits nothing (see `maybeFireAutoTopupTx`). Accepting
    // `enabled: true` and returning 200 would tell every client the feature
    // works and leave a rule that only ever produces a warning log. The
    // `enabled: false` write path stays open so anyone with a stored rule
    // can still turn theirs off.
    if (dto.enabled === true) {
      throw new BadRequestException(AUTO_TOPUP_UNAVAILABLE_REASON);
    }

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
    // Set only on the pass that actually posts the ledger entry, so a
    // retried request — which `IdempotencyService` answers from its stored
    // response without re-running this callback — cannot write a second
    // audit row for one adjustment.
    let performed = false;

    const result = await this.idempotency.run(adminUserId, 'wallet.adjust', idempotencyKey, async (tx) => {
      const wallet = await this.getOrCreateWalletTx(tx, dto.userId);
      const { balanceAfter, transactionId } = await this.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: dto.direction,
        category: 'adjustment',
        amount: dto.amount,
        title: `Admin adjustment — ${dto.reason}`,
      });
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      performed = true;
      // `transactionId` included (M9 — closes the M8.4b-flagged shape
      // gap) so `client/lib/api/admin.ts#adjustWallet` no longer has to
      // synthesize a fake id for the `WalletTransaction` it hands back
      // to its caller.
      return { wallet: mapWallet(updated), balanceAfter, transactionId };
    });

    // After the transaction, never inside it — the audit row records that
    // the adjustment happened, so it must not survive one that rolled
    // back. Same contract as `server/src/admin/**`.
    //
    // `POST /wallet/adjust` is `@Roles('admin')` and moves money into or
    // out of somebody's balance, and until now it wrote no audit row,
    // because `WalletModule` could not import the writer without a module
    // cycle. `/admin/wallet/:userId/adjust` has always been audited.
    // `reason` is included deliberately: for a debit clawing back an
    // uncollected credit, that sentence is the only record of why a
    // balance went down.
    if (performed) {
      await this.auditLog.log({
        actorId: adminUserId,
        action: 'wallet.adjust',
        targetType: 'user',
        targetId: dto.userId,
        metadata: {
          direction: dto.direction,
          amount: dto.amount,
          reason: dto.reason,
          via: 'wallet.adjust',
        },
      });
    }

    return result;
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
   * Auto-top-up is **disabled**, and this method deliberately credits
   * nothing.
   *
   * It used to post a `credit`/`topup` ledger entry for `rule.topupAmount`
   * whenever a debit dropped the balance under the rule's threshold — with
   * **no Razorpay charge and no captured payment behind it**. Since
   * `PUT /wallet/auto-topup` is owner-scoped and its DTO capped nothing,
   * any signed-in shopper could set a large `topupAmount`, make one debit,
   * and mint real spendable balance that buys real food from real home
   * kitchens who then draw real payouts.
   *
   * The honest fix is not to charge harder, it is to stop crediting: there
   * is no saved card and no mandate to charge against. `creditTopupTx`
   * (the only legitimate credit path) runs solely from
   * `PaymentsService.handleWebhook` after HMAC verification.
   *
   * Kept as a logging stub rather than deleted so we can see whether anyone
   * actually has a rule that would have fired. Re-enabling this means
   * wiring a real recurring mandate (UPI AutoPay / e-mandate) first —
   * see `docs/LAUNCH-READINESS.md`.
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
    if (!(Number(rule.topupAmount) > 0)) return balanceAfterDebit;

    // Rule id and wallet id only — never the balance or the amount.
    this.logger.warn(
      `Auto-top-up suppressed (feature disabled): rule=${rule.id} wallet=${walletId}`,
    );
    return balanceAfterDebit;
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
