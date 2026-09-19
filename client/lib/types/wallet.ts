/**
 * Wallet types — one balance shared across Marketplace, Laundry and
 * Snacks. See `docs/DATA-MODEL.md` for the ledger rules; the server is
 * the sole writer of `balanceAfter` once M8 lands (client never computes
 * balance locally).
 */

import type { ID, ISODateString } from "./shared";

export type WalletTransactionDirection = "credit" | "debit";

export type WalletTransactionCategory =
  | "topup"
  /**
   * **Legacy value, deliberately kept.** Order cashback was removed on
   * 2026-09-19, but ledger rows already in the database carry this category
   * — the old "Cashback — Order #…" credits, their reversals, and the 3%
   * top-up bonus, which is filed under it too — and `TransactionRow` renders
   * them by title. Nothing new writes an order-cashback row.
   */
  | "cashback"
  | "refund"
  | "payment"
  | "referral"
  | "loyalty"
  /** Admin manual credit/debit with a reason (M11b, `/admin/wallet`) — distinct from `"refund"` (order-tied, consumer-initiated in spirit) since a real ledger needs to tell "we made this right after a support case" apart from "the system refunded an order" for audit purposes. */
  | "adjustment";

export type WalletTransactionRefType =
  | "order"
  | "laundryBooking"
  | "topup"
  | "referral"
  | "loyalty"
  | "support";

export interface WalletTransaction {
  id: ID;
  walletId: ID;
  direction: WalletTransactionDirection;
  category: WalletTransactionCategory;
  /** Always positive; `direction` carries the sign. */
  amount: number;
  /** Running balance immediately after this transaction settles. */
  balanceAfter: number;
  title: string;
  refType?: WalletTransactionRefType;
  refId?: ID;
  createdAt: ISODateString;
}

export interface Wallet {
  id: ID;
  userId: ID;
  balance: number;
  /**
   * Kept because the server still returns it (an installed native build
   * reads it), and always 0 in practice — nothing has ever written it. No
   * web screen renders it since order cashback was removed (2026-09-19).
   */
  pendingCashback: number;
  /**
   * A running total of order cashback earned. Frozen: it no longer grows, a
   * legacy reversal can still lower it, and no web screen renders it.
   */
  lifetimeSaved: number;
  /** "Pay with wallet" toggle at checkout — on by default per spec. */
  payWithWalletDefault: boolean;
  updatedAt: ISODateString;
}

export type AutoTopupTrigger = "below-threshold" | "scheduled";

export interface AutoTopupRule {
  id: ID;
  walletId: ID;
  enabled: boolean;
  trigger: AutoTopupTrigger;
  /** Required when trigger is "below-threshold". */
  thresholdAmount?: number;
  topupAmount: number;
  /** Saved instrument reference (Razorpay token id, once M8 lands). */
  paymentMethodRef?: string;
  /**
   * Whether the rule can actually fire, as opposed to whether the shopper
   * switched it on. Auto-top-up is paused platform-wide — the credit it
   * posted had no captured payment behind it — so `enabled` may be `true`
   * on a legacy row while `active` is `false`. Any client rendering this
   * feature must read `active`, not `enabled`; a native app that only
   * checked `enabled` would tell people it works.
   */
  active?: boolean;
  /** Why `active` is false, ready to show the user. */
  unavailableReason?: string;
}
