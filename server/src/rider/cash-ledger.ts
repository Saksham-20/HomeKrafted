import { CashSettlementMode, RiderCashEntryType } from '@prisma/client';

/**
 * D8's ledger, made pure — the one place that knows the sign convention
 * (`RiderCashEntryType`'s own doc comment in `schema.prisma` points back
 * here) and the one place that decides "is this rider blocked" and "how
 * much does a payout take". Every reader — `dispatch.ts`'s cash-limit
 * filter, `RiderOnboardingService.me`, `RiderCashService`,
 * `AdminRiderPayoutsService` — goes through this file rather than
 * re-deriving the arithmetic, the same reason `rider-pay.ts` is one file.
 *
 * No clock read anywhere here (the R1–R4 cross-cutting rule): every
 * function that needs "now" takes it as an argument.
 */

/** Rupees, matching `RiderCashEntry.amount`'s `Decimal(12,2)` column — this file works in the same unit the ledger is stored in, unlike `rider-pay.ts`'s paise. */
export interface CashEntryAmount {
  amount: number;
}

/**
 * `SUM(amount)` over a rider's cash entries — a positive result is what
 * the rider owes the platform (mostly `cod_collected`), a negative one
 * would mean they have deposited/been deducted more than they ever
 * collected. Callers that only need the number (dispatch's tick, `GET
 * /rider/me`) may still let Postgres do this sum (`prisma.aggregate`) for
 * one query instead of fetching every row — that is still "computed from
 * rows", just done in the database. This function exists for the callers
 * that already hold the rows (a page of entries, a test) and for the
 * deduction/limit logic below, which needs the individual rows, not only
 * their sum.
 */
export function balanceOf(entries: CashEntryAmount[]): number {
  return round2(entries.reduce((sum, entry) => sum + entry.amount, 0));
}

/**
 * D9: "over the limit ⇒ no new COD offers, prepaid still allowed." Strict
 * `>` — R2's own dispatch tests already pin "exactly at the limit is
 * still eligible for a COD offer", i.e. the limit is the last rupee a
 * rider may hold, not the first one refused. `dispatch.ts`'s per-job
 * check adds the job's own `codAmount` to the balance before calling
 * this, so "would this job push them over" and "are they already
 * blocked" are the same call with a different `balance` argument.
 */
export function isCodBlocked(balance: number, limit: number): boolean {
  return balance > limit;
}

/** §2.4: a rider gets a week's grace on cash they've said they'll deposit before it is taken out of a payout instead. */
export const DEPOSIT_GRACE_DAYS = 7;

export interface DeductionEntry {
  amount: number;
  createdAt: Date;
}

/**
 * §2.4's payout arithmetic: `net = earnings − (cash still in hand if
 * deduct-mode, or cash older than 7 days in deposit-mode)`.
 *
 * `deduct_from_payout` (the default): the platform takes the *whole*
 * current balance out of this payout, capped at what the payout is
 * actually worth — a rider who owes more cash than they earned this
 * period has that debt still owed on their next payout (the running
 * balance carries it forward automatically; nothing here writes a
 * negative deduction).
 *
 * `deposit`: the rider has said they'll pay it back themselves, so only
 * the portion of the balance that is *older than `DEPOSIT_GRACE_DAYS`*
 * (relative to `now`) is fair game — the week's grace §2.4 promises. A
 * `deposit`/`payout_deduction`/`adjustment` entry inside the grace
 * window still counts toward the "older" sum once it ages past it, the
 * same as `cod_collected` does; this sums *every* entry timestamped
 * before the cutoff, not only collections.
 *
 * Either way the result never exceeds `earnings` (a payout cannot go
 * negative — CLAUDE.md's "negative net carries forward, never becomes a
 * bank debit") and never goes below zero (a rider who has *overpaid* —
 * deposited more than they owed — is not charged for the privilege; that
 * surplus just makes their balance more negative, which lowers every
 * future deduction until it's worked off).
 */
/**
 * How much cash to take out of a payout.
 *
 * Two corrections the first version missed, both of which charged a rider
 * twice for the same cash:
 *
 * - **Pending deposits are already paid.** A rider who sent ₹500 by UPI on
 *   Monday is not still holding it on Sunday just because nobody has
 *   verified the UTR yet. Their amount comes off what is owed before
 *   anything is deducted; a later verify then lands exactly once.
 * - **In deposit mode, grace applies to recent *collections*, not to the
 *   age of the balance.** Summing only entries older than 7 days ignored a
 *   deposit made yesterday against cash collected ten days ago, and
 *   deducted the ₹500 a second time. What is overdue is what is owed now
 *   less what was collected inside the grace window.
 */
export function deductionFor(input: {
  mode: CashSettlementMode;
  entries: DeductionEntry[];
  earnings: number;
  now: Date;
  /** Sum of this rider's deposits still `pending` (submitted, not yet verified). */
  pendingDeposits?: number;
}): number {
  const { mode, entries, earnings, now, pendingDeposits = 0 } = input;
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);

  let owed = balance;
  if (mode === 'deposit') {
    const cutoff = now.getTime() - DEPOSIT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const inGrace = entries
      .filter((e) => e.amount > 0 && e.createdAt.getTime() > cutoff)
      .reduce((sum, e) => sum + e.amount, 0);
    owed = balance - inGrace;
  }

  return clamp(owed - pendingDeposits, earnings);
}

/** What a rider may still submit as a deposit: owed, less what is already awaiting verification. */
export function depositableAmount(balance: number, pendingDeposits: number): number {
  return round2(Math.max(0, balance - pendingDeposits));
}

function clamp(amount: number, earnings: number): number {
  return round2(Math.max(0, Math.min(amount, earnings)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Re-exported only so a caller doesn't need a second import for the enum this file is built around. */
export type { RiderCashEntryType };
