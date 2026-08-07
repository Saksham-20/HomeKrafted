import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Generic idempotency-key wrapper for money-mutating ops (`wallet.adjust`,
 * `orders.payWithWallet`, `orders.refund`, ...). A repeat call scoped to the
 * same `(userId, scope, key)` triple returns the first call's stored JSON
 * result instead of re-running `work` — the defense against a client retry
 * or a double-submit double-applying a debit/credit.
 *
 * Mechanics (no polling, no separate lock table):
 * 1. `work` runs inside one `$transaction`. The first statement inside it
 *    INSERTs a claim row into `IdempotencyKey` keyed on the unique
 *    `(userId, scope, key)` index.
 * 2. If that insert succeeds, `work` runs for real, and its result is
 *    stamped onto the same row before the transaction commits.
 * 3. A concurrent second call with the identical key attempts the same
 *    INSERT. Postgres blocks that INSERT on the uncommitted duplicate key
 *    until the first transaction concludes — then either raises a unique
 *    violation (first one committed) or lets the insert through (first one
 *    rolled back, e.g. because `work` threw — see the note below). This is
 *    a `SELECT` (fast path) plus ordinary transactional isolation, not a
 *    hand-rolled lock.
 * 4. On catching that unique violation, this method re-reads the row —
 *    which, because step 3 only unblocks after the winning transaction's
 *    COMMIT, is guaranteed to already hold the finished JSON result — and
 *    returns it instead of re-running `work`.
 *
 * Note: if `work` throws (e.g. insufficient balance), the whole transaction
 * — including the claim-row insert — rolls back, so the key is *not*
 * consumed. A client can legitimately retry the same key after fixing
 * whatever caused the rejection (e.g. topping up first) and it will run
 * `work` again rather than replaying a cached failure.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The stored result for a key, or `undefined` if this key has never
   * completed. Same lookup `run` does on its fast path, exposed for a
   * caller that validates *before* it reaches `run`.
   *
   * `OrdersService.create` is the case: it reads and checks the cart, the
   * addresses and stock before opening its transaction. A sequential
   * replay — a refresh, a retried request — therefore failed the cart
   * check with a 400 "Cart is empty" before `run` ever got the chance to
   * hand back the order that first call created. No duplicate was made,
   * but the shopper saw an error for an order that had in fact succeeded,
   * which is most of the point of having a key.
   */
  async replay<T>(userId: string, scope: string, key: string): Promise<T | undefined> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope, key } },
    });
    return existing ? (existing.responseBody as T) : undefined;
  }

  async run<T>(
    userId: string,
    scope: string,
    key: string | undefined,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return this.prisma.$transaction((tx) => work(tx));
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope, key } },
    });
    if (existing) return existing.responseBody as T;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Placeholder body — overwritten below once `work` resolves. Never
        // observable by another transaction mid-flight: Postgres MVCC means
        // concurrent readers see either nothing (pre-commit) or this fully
        // stamped row (post-commit), never the placeholder.
        await tx.idempotencyKey.create({
          data: { userId, scope, key, responseBody: {} },
        });
        const result = await work(tx);
        await tx.idempotencyKey.update({
          where: { userId_scope_key: { userId, scope, key } },
          data: { responseBody: result as object },
        });
        return result;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.idempotencyKey.findUnique({
          where: { userId_scope_key: { userId, scope, key } },
        });
        if (winner) return winner.responseBody as T;
        // Extremely unlikely (the other transaction rolled back after all,
        // between our failed insert and this re-read) — surface as a
        // conflict rather than silently re-running `work` outside any
        // idempotency protection.
        throw new ConflictException('Duplicate request already in progress — please retry shortly');
      }
      throw err;
    }
  }
}
