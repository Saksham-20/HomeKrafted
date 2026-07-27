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
  pendingCashback: number;
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
}
