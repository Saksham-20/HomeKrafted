"use client";

/**
 * Client-side wallet store (M6) — mirrors `lib/cart/CartContext.tsx`'s
 * shape exactly: a React context, hydrated post-mount from `localStorage`
 * (guards against an SSR/client markup mismatch, same as Cart), seeded on
 * first-ever load from the mock `lib/api/wallet` layer. There is no
 * backend yet, so every op below (`topUp`/`pay`/`earnCashback`/`refund`/
 * `setAutoTopup`) mutates local React state and appends a `WalletTransaction`
 * that matches `lib/types/wallet.ts`'s shape exactly — M8 lifts this same
 * shape server-side (swap the localStorage read/write + local ledger math
 * for `fetch` calls against a real, **server-authoritative** `/api/wallet`
 * ledger; the server must own `balanceAfter` and make every write
 * idempotent, since a client can never be trusted to compute its own
 * balance — see `docs/DATA-MODEL.md`). Every `useWallet()` call site stays
 * unchanged across that swap.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAutoTopupRule, getTransactions, getWallet } from "@/lib/api";
import type { AutoTopupRule, ID, WalletTransaction, WalletTransactionRefType } from "@/lib/types";

const STORAGE_KEY = "hk_wallet_v1";

/** Top-ups above this amount earn a 3% bonus credit — ported from the prototype's "Get 3% extra on top-ups above ₹2,000" copy, now actually wired instead of purely decorative. */
export const TOPUP_BONUS_THRESHOLD = 2000;
export const TOPUP_BONUS_RATE = 0.03;

interface WalletState {
  balance: number;
  pendingCashback: number;
  lifetimeSaved: number;
  transactions: WalletTransaction[];
  autoTopup: AutoTopupRule;
}

/** Reference info a caller attaches to a ledger-mutating op — becomes the `WalletTransaction`'s `title`/`refType`/`refId`. */
export interface WalletTxnRef {
  title: string;
  refType?: WalletTransactionRefType;
  refId?: ID;
}

export interface PayResult {
  ok: boolean;
}

export interface WalletContextValue {
  balance: number;
  pendingCashback: number;
  lifetimeSaved: number;
  transactions: WalletTransaction[];
  autoTopup: AutoTopupRule;
  /** True once localStorage + the seeded mock wallet/ledger have both loaded. */
  ready: boolean;
  /** Credits the wallet — a top-up above `TOPUP_BONUS_THRESHOLD` also appends a separate 3% bonus credit. */
  topUp: (amount: number) => void;
  /** Debits the wallet for a purchase. Returns `{ ok: false }` without mutating state when the balance can't cover `amount` — callers must gate the wallet payment option on this / on a live `balance >= total` check before calling. Auto-fires the configured `below-threshold` top-up rule (if enabled) when the debit drops the balance under the threshold. */
  pay: (amount: number, ref: WalletTxnRef) => PayResult;
  /** Credits cashback earned on an order/booking; also adds to `lifetimeSaved`. */
  earnCashback: (amount: number, ref: WalletTxnRef) => void;
  /** Credits an instant refund. Does not add to `lifetimeSaved` (it's a return of the shopper's own money, not a saving). */
  refund: (amount: number, ref: WalletTxnRef) => void;
  /**
   * Credits a referral reward (M7b) — same shape as `earnCashback` but
   * appends `category: "referral"` (matching `WalletTransactionCategory`)
   * instead of `"cashback"`, and does not add to `lifetimeSaved` (a
   * referral bonus isn't a shopping saving). Used by
   * `/account/referrals`'s demo "apply referral credit" button after
   * `applyReferralCredit()` (`lib/api/referrals.ts`) advances a `Referral`
   * to `rewarded`.
   */
  earnReferralCredit: (amount: number, ref: WalletTxnRef) => void;
  /** Merges a partial update into the auto-top-up rule (e.g. `{ enabled: true }` or `{ thresholdAmount: 500 }`). */
  setAutoTopup: (patch: Partial<AutoTopupRule>) => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readStorage(): WalletState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WalletState>;
    if (typeof parsed.balance !== "number" || !Array.isArray(parsed.transactions) || !parsed.autoTopup) {
      return null;
    }
    return {
      balance: parsed.balance,
      pendingCashback: parsed.pendingCashback ?? 0,
      lifetimeSaved: parsed.lifetimeSaved ?? 0,
      transactions: parsed.transactions,
      autoTopup: parsed.autoTopup,
    };
  } catch {
    return null;
  }
}

const EMPTY_STATE: WalletState = {
  balance: 0,
  pendingCashback: 0,
  lifetimeSaved: 0,
  transactions: [],
  autoTopup: {
    id: "atr-pending",
    walletId: "wallet-demo",
    enabled: false,
    trigger: "below-threshold",
    thresholdAmount: 0,
    topupAmount: 0,
  },
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Hydrate from localStorage + load the seeded mock wallet once, client-side
  // only (same reasoning as CartProvider: avoids an SSR/client markup
  // mismatch — server always renders the zero-balance state, then this
  // fills in a moment after mount).
  useEffect(() => {
    const stored = readStorage();
    Promise.all([getWallet(), getTransactions(), getAutoTopupRule()]).then(
      ([wallet, transactions, autoTopup]) => {
        setState(
          stored ?? {
            balance: wallet.balance,
            pendingCashback: wallet.pendingCashback,
            lifetimeSaved: wallet.lifetimeSaved,
            transactions,
            autoTopup,
          },
        );
        setReady(true);
        hydrated.current = true;
      },
    );
  }, []);

  // Persist on every change, once initial hydration has happened (so we
  // don't clobber existing storage with the pre-hydration empty state).
  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const topUp = useCallback((amount: number) => {
    if (amount <= 0) return;
    setState((current) => {
      const now = new Date().toISOString();
      let nextBalance = current.balance + amount;
      const transactions: WalletTransaction[] = [
        {
          id: genId("wt"),
          walletId: current.autoTopup.walletId,
          direction: "credit",
          category: "topup",
          amount,
          balanceAfter: nextBalance,
          title: "Wallet top-up",
          refType: "topup",
          createdAt: now,
        },
        ...current.transactions,
      ];

      if (amount > TOPUP_BONUS_THRESHOLD) {
        const bonus = Math.round(amount * TOPUP_BONUS_RATE);
        nextBalance += bonus;
        transactions.unshift({
          id: genId("wt"),
          walletId: current.autoTopup.walletId,
          direction: "credit",
          category: "cashback",
          amount: bonus,
          balanceAfter: nextBalance,
          title: "Top-up bonus (3%)",
          refType: "topup",
          createdAt: now,
        });
      }

      return { ...current, balance: nextBalance, transactions };
    });
  }, []);

  // `pay`'s insufficient-balance check reads the last-rendered `state`
  // (not a stale value in normal single-call usage — every op re-renders
  // every `useWallet()` consumer) rather than reaching into the `setState`
  // updater's `current`, so the caller gets a synchronous, deterministic
  // `{ ok }` back instead of depending on React's update-batching timing.
  const pay = useCallback(
    (amount: number, ref: WalletTxnRef): PayResult => {
      if (amount <= 0) return { ok: true };
      if (state.balance < amount) return { ok: false };

      setState((current) => {
        if (current.balance < amount) return current; // safety net; shouldn't happen given the guard above
        const now = new Date().toISOString();
        const afterPay = current.balance - amount;
        const transactions: WalletTransaction[] = [
          {
            id: genId("wt"),
            walletId: current.autoTopup.walletId,
            direction: "debit",
            category: "payment",
            amount,
            balanceAfter: afterPay,
            title: ref.title,
            refType: ref.refType,
            refId: ref.refId,
            createdAt: now,
          },
          ...current.transactions,
        ];

        let nextBalance = afterPay;
        const rule = current.autoTopup;
        // Auto-top-up only ever fires reactively, after a successful
        // payment leaves the balance under the configured floor — it
        // never rescues an insufficient payment (see the early-return
        // guard above). M8's server should make this an idempotent,
        // server-scheduled job instead of a synchronous client append.
        if (
          rule.enabled &&
          rule.trigger === "below-threshold" &&
          rule.thresholdAmount !== undefined &&
          nextBalance < rule.thresholdAmount
        ) {
          nextBalance += rule.topupAmount;
          transactions.unshift({
            id: genId("wt"),
            walletId: rule.walletId,
            direction: "credit",
            category: "topup",
            amount: rule.topupAmount,
            balanceAfter: nextBalance,
            title: "Auto top-up",
            refType: "topup",
            createdAt: now,
          });
        }

        return { ...current, balance: nextBalance, transactions };
      });

      return { ok: true };
    },
    [state.balance],
  );

  const earnCashback = useCallback((amount: number, ref: WalletTxnRef) => {
    if (amount <= 0) return;
    setState((current) => {
      const nextBalance = current.balance + amount;
      return {
        ...current,
        balance: nextBalance,
        lifetimeSaved: current.lifetimeSaved + amount,
        transactions: [
          {
            id: genId("wt"),
            walletId: current.autoTopup.walletId,
            direction: "credit",
            category: "cashback",
            amount,
            balanceAfter: nextBalance,
            title: ref.title,
            refType: ref.refType,
            refId: ref.refId,
            createdAt: new Date().toISOString(),
          },
          ...current.transactions,
        ],
      };
    });
  }, []);

  const refund = useCallback((amount: number, ref: WalletTxnRef) => {
    if (amount <= 0) return;
    setState((current) => {
      const nextBalance = current.balance + amount;
      return {
        ...current,
        balance: nextBalance,
        transactions: [
          {
            id: genId("wt"),
            walletId: current.autoTopup.walletId,
            direction: "credit",
            category: "refund",
            amount,
            balanceAfter: nextBalance,
            title: ref.title,
            refType: ref.refType,
            refId: ref.refId,
            createdAt: new Date().toISOString(),
          },
          ...current.transactions,
        ],
      };
    });
  }, []);

  const earnReferralCredit = useCallback((amount: number, ref: WalletTxnRef) => {
    if (amount <= 0) return;
    setState((current) => {
      const nextBalance = current.balance + amount;
      return {
        ...current,
        balance: nextBalance,
        transactions: [
          {
            id: genId("wt"),
            walletId: current.autoTopup.walletId,
            direction: "credit",
            category: "referral",
            amount,
            balanceAfter: nextBalance,
            title: ref.title,
            refType: ref.refType,
            refId: ref.refId,
            createdAt: new Date().toISOString(),
          },
          ...current.transactions,
        ],
      };
    });
  }, []);

  const setAutoTopup = useCallback((patch: Partial<AutoTopupRule>) => {
    setState((current) => ({ ...current, autoTopup: { ...current.autoTopup, ...patch } }));
  }, []);

  const value: WalletContextValue = {
    balance: state.balance,
    pendingCashback: state.pendingCashback,
    lifetimeSaved: state.lifetimeSaved,
    transactions: state.transactions,
    autoTopup: state.autoTopup,
    ready,
    topUp,
    pay,
    earnCashback,
    refund,
    earnReferralCredit,
    setAutoTopup,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
