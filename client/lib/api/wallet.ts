import type { AutoTopupRule, Wallet, WalletTransaction } from "@/lib/types";
import { defaultAutoTopupRule, topupOptions, wallet, walletTransactions } from "@/lib/data";
import { http, isMockMode } from "./http";

/** Wallet reads (M8.4a — real). `docs/API.md` "Wallet & Payments (M8.2)" — owner-scoped, server-authoritative; there's deliberately no bare top-up/pay/refund endpoint (see `WalletContext`). */

export async function getWallet(): Promise<Wallet> {
  if (isMockMode()) return wallet;
  return http.get<Wallet>("/wallet");
}

export async function getTransactions(): Promise<WalletTransaction[]> {
  if (isMockMode()) return walletTransactions;
  return http.get<WalletTransaction[]>("/wallet/transactions");
}

/** Static amount-picker tiles — not itself a money-moving call, so it stays client-side config. */
export async function getTopupOptions(): Promise<number[]> {
  return topupOptions;
}

export async function getAutoTopupRule(): Promise<AutoTopupRule> {
  if (isMockMode()) return defaultAutoTopupRule;
  return http.get<AutoTopupRule>("/wallet/auto-topup");
}

export interface AutoTopupPatch {
  enabled?: boolean;
  trigger?: AutoTopupRule["trigger"];
  thresholdAmount?: number;
  topupAmount?: number;
  paymentMethodRef?: string;
}

/** `PUT /wallet/auto-topup` — partial patch, upserts. */
export async function updateAutoTopupRule(patch: AutoTopupPatch): Promise<AutoTopupRule> {
  return http.put<AutoTopupRule>("/wallet/auto-topup", patch);
}

export interface RazorpayOrderResult {
  razorpayOrderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  keyId: string;
  mock: boolean;
}

/**
 * `POST /payments/razorpay/order` — opens a Razorpay order for either a
 * marketplace order (`purpose: "order"`, `orderId`) or a wallet top-up
 * (`purpose: "topup"`, `amount`). `mock: true` in the response means
 * `RAZORPAY_KEY_ID`/`_SECRET` are still `server/.env.example`'s
 * placeholders — see `lib/payments/razorpay.ts`'s file header.
 */
export async function createRazorpayOrder(
  input: { purpose: "order"; orderId: string } | { purpose: "topup"; amount: number },
): Promise<RazorpayOrderResult> {
  return http.post<RazorpayOrderResult>("/payments/razorpay/order", input);
}
