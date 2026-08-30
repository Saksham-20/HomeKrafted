"use client";

/**
 * Wallet store (M8.4a — real for the consumer role). Real mode: hydrates
 * from `GET /wallet` + `GET /wallet/transactions` + `GET /wallet/auto-topup`
 * once the signed-in consumer session is ready (`useAuth()`), and every
 * mutation now goes through the server:
 *  - `topUp` → `POST /payments/razorpay/order` (`purpose: "topup"`) + the
 *    Razorpay Checkout SDK (`lib/payments/razorpay.ts`); the wallet credit
 *    itself only happens once Razorpay's `payment.captured` webhook lands
 *    server-side, so this refetches the wallet after a successful charge.
 *  - `pay` → `POST /orders/:id/pay` (marketplace wallet-pay; laundry's
 *    wallet-pay is atomic with booking creation server-side, so
 *    `LaundryBookingClient` no longer calls this at all — see that file).
 *  - `earnCashback`/`refund`/`earnReferralCredit` no longer compute
 *    anything client-side (the server is the only ledger writer now) —
 *    they just trigger a refetch of the balance/transactions the caller's
 *    own server-side mutation (order pay, laundry booking, referral
 *    apply-credit, admin refund) already applied. Kept as named,
 *    void-returning methods so every existing call site
 *    (`CheckoutClient`, `LaundryBookingClient`, `ReferralsClient`) keeps
 *    working unchanged.
 *
 * `NEXT_PUBLIC_USE_MOCK=true` keeps the exact pre-M8.4a behavior: a
 * `localStorage`-persisted local ledger with client-computed
 * `balanceAfter`, seeded from the mock `lib/api/wallet` layer, no network
 * calls, no auth gating.
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
// Imported from the module, not the `@/lib/api` barrel. This file is
// `"use client"` and sits in the root layout, so anything it imports
// ships to every page; through the barrel that was the *entire* API
// layer — admin, seller, meal plans, Razorpay — on the landing page.
import { payOrder } from "@/lib/api/orders";
import {
  createRazorpayOrder,
  getAutoTopupRule,
  getTransactions,
  getWallet,
  updateAutoTopupRule,
} from "@/lib/api/wallet";
import { ApiError, isMockMode } from "@/lib/api/http";
import { openRazorpayCheckout } from "@/lib/payments/razorpay";
import { useAuth } from "@/lib/auth/AuthContext";
import type { AutoTopupRule, ID, WalletTransaction, WalletTransactionRefType } from "@/lib/types";

const STORAGE_KEY = "hk_wallet_v1";
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "rzp_test_placeholder";

/** Top-ups above this amount earn a 3% bonus credit — ported from the prototype's "Get 3% extra on top-ups above ₹2,000" copy. Real mode: the server applies the identical rule on webhook capture (`server/src/payments/`) — these constants stay here only for the mock math + the pre-payment "you'll earn a bonus" preview copy in `WalletClient`. */
export const TOPUP_BONUS_THRESHOLD = 2000;
export const TOPUP_BONUS_RATE = 0.03;

interface WalletState {
  balance: number;
  pendingCashback: number;
  lifetimeSaved: number;
  transactions: WalletTransaction[];
  /**
   * The cursor for the next ledger page, or `null` when the loaded rows
   * are the whole history. Held in state rather than derived, because
   * "there is more" is something only the server can answer — the client
   * cannot tell a full page from the last page.
   */
  transactionsCursor: string | null;
  autoTopup: AutoTopupRule;
}

/** Reference info a caller attaches to a ledger-mutating op — becomes the mock `WalletTransaction`'s `title`/`refType`/`refId` (mock mode) or is otherwise unused for display only (real mode — the server already wrote the real title). */
export interface WalletTxnRef {
  title: string;
  refType?: WalletTransactionRefType;
  refId?: ID;
}

export interface PayResult {
  ok: boolean;
  /** Real mode only — a server-provided message when `ok: false` (e.g. balance changed), for a more specific error than the caller's own generic fallback copy. */
  message?: string;
}

export interface WalletContextValue {
  balance: number;
  pendingCashback: number;
  lifetimeSaved: number;
  transactions: WalletTransaction[];
  /** True when the server holds ledger rows older than the ones loaded — i.e. `loadMoreTransactions` has something to fetch. Always `false` in mock mode, which has one page by construction. */
  hasMoreTransactions: boolean;
  /** Appends the next page of ledger rows. Resolves `false` when there was nothing left to fetch. */
  loadMoreTransactions: () => Promise<boolean>;
  autoTopup: AutoTopupRule;
  /** True once the wallet has hydrated (mock: localStorage + seed; real: the signed-in consumer's `GET /wallet`, or immediately `true` with zero values for a non-consumer/signed-out session). */
  ready: boolean;
  /** Credits the wallet. Real mode: opens Razorpay Checkout for `amount`, resolves once the server has re-confirmed the credit; rejects if the checkout is dismissed/fails. */
  topUp: (amount: number) => Promise<void>;
  /** Debits the wallet for a purchase. Real mode: `ref.refType` must be `"order"` with `ref.refId` set to the real `Order.id` — pays via `POST /orders/:id/pay`. Returns `{ ok: false }` without mutating anything when the balance can't cover `amount` (mock) or the server rejects with `INSUFFICIENT_BALANCE` (real). */
  pay: (amount: number, ref: WalletTxnRef) => Promise<PayResult>;
  /** Refreshes the wallet after cashback was credited server-side elsewhere (or, in mock mode, credits it locally). */
  earnCashback: (amount: number, ref: WalletTxnRef) => void;
  /** Refreshes the wallet after a refund was credited server-side elsewhere (or, in mock mode, credits it locally). */
  refund: (amount: number, ref: WalletTxnRef) => void;
  /** Refreshes the wallet after `lib/api/referrals.ts#applyReferralCredit` credited a referral reward server-side (or, in mock mode, credits it locally). */
  earnReferralCredit: (amount: number, ref: WalletTxnRef) => void;
  /** Merges a partial update into the auto-top-up rule — optimistic locally, reconciled with `PUT /wallet/auto-topup`'s response in real mode. */
  setAutoTopup: (patch: Partial<AutoTopupRule>) => void;
  /** Re-fetches balance/transactions from the server (no-op in mock mode). Used after a mutation that credited/debited the wallet as a side effect of a *different* endpoint — e.g. `LaundryBookingClient`'s wallet-paid booking, which debits atomically server-side inside `POST /laundry/bookings` itself. */
  refresh: () => void;
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
      // Mock mode only ever holds one page, and a cursor read back from
      // storage would point into a server ledger this state never came
      // from. Always start fresh.
      transactionsCursor: null,
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
  transactionsCursor: null,
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
  const mock = isMockMode();
  const { ready: authReady, isSignedIn, role, user } = useAuth();
  const [state, setState] = useState<WalletState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const refreshFromServer = useCallback(async () => {
    const [w, page] = await Promise.all([getWallet(), getTransactions()]);
    setState((current) => ({
      ...current,
      balance: w.balance,
      pendingCashback: w.pendingCashback,
      lifetimeSaved: w.lifetimeSaved,
      // Back to page one deliberately. A refresh follows something that
      // just wrote a row, so the newest page is the one that changed;
      // stitching it onto pages fetched before the write would show the
      // ledger as it was either side of a row that moved everything down.
      transactions: page.items,
      transactionsCursor: page.nextCursor,
    }));
  }, []);

  /**
   * Appends the next ledger page. Resolves to `false` when there was
   * nothing more to fetch, so a caller can stop asking.
   */
  const loadMoreTransactions = useCallback(async (): Promise<boolean> => {
    // Read straight from state, with the cursor in the dependency list.
    // The two shortcuts here are both wrong: a ref assigned during render
    // is what `react-hooks/refs` exists to stop, and a `setState` updater
    // that reads `current` and returns it unchanged still runs during
    // render — and twice in development.
    const cursor = state.transactionsCursor;
    if (!cursor) return false;
    const page = await getTransactions(cursor);
    setState((current) => ({
      ...current,
      // Guard against a double-tap appending the same page twice — the
      // button is disabled while loading, but a slow network plus an
      // impatient second click is exactly how duplicate keys reach React.
      transactions: [
        ...current.transactions,
        ...page.items.filter((row) => !current.transactions.some((seen) => seen.id === row.id)),
      ],
      transactionsCursor: page.nextCursor,
    }));
    return true;
  }, [state.transactionsCursor]);

  // Mock mode: hydrate from localStorage + the seeded mock wallet once,
  // client-side only, exactly as pre-M8.4a (no auth gating).
  useEffect(() => {
    if (!mock) return;
    const stored = readStorage();
    Promise.all([getWallet(), getTransactions(), getAutoTopupRule()]).then(
      ([w, page, autoTopup]) => {
        setState(
          stored ?? {
            balance: w.balance,
            pendingCashback: w.pendingCashback,
            lifetimeSaved: w.lifetimeSaved,
            transactions: page.items,
            transactionsCursor: page.nextCursor,
            autoTopup,
          },
        );
        setReady(true);
        hydrated.current = true;
      },
    );
  }, [mock]);

  // Real mode: wait for the auth session, then hydrate the signed-in
  // consumer's real wallet. A seller/admin session (or signed-out) just
  // renders the zero-value empty state — this store is consumer-only.
  useEffect(() => {
    if (mock) return;
    if (!authReady) return;
    if (!isSignedIn || role !== "consumer") {
      // Deferred a tick to avoid a synchronous `setState` directly in the
      // effect body (`react-hooks/set-state-in-effect`).
      let cancelled = false;
      Promise.resolve().then(() => {
        if (cancelled) return;
        setState(EMPTY_STATE);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    Promise.all([getWallet(), getTransactions(), getAutoTopupRule()]).then(
      ([w, page, autoTopup]) => {
        if (cancelled) return;
        setState({
          balance: w.balance,
          pendingCashback: w.pendingCashback,
          lifetimeSaved: w.lifetimeSaved,
          transactions: page.items,
          transactionsCursor: page.nextCursor,
          autoTopup,
        });
        setReady(true);
        hydrated.current = true;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mock, authReady, isSignedIn, role]);

  // Mock mode only — persist on every change, once initial hydration has
  // happened (so we don't clobber existing storage with the pre-hydration
  // empty state).
  useEffect(() => {
    if (!mock || !hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [mock, state]);

  const topUp = useCallback(
    async (amount: number): Promise<void> => {
      if (amount <= 0) return;

      if (mock) {
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
        return;
      }

      const order = await createRazorpayOrder({ purpose: "topup", amount });
      // The server has just told us it minted a *mock* order because it has
      // no usable Razorpay keys. Handing that to the real Checkout SDK is
      // the hang described in `getPaymentsConfig` — the widget 401s, hides
      // itself, and never calls back, leaving this promise pending and the
      // page scroll-locked. Callers gate on `getPaymentsConfig()` before
      // reaching here; this is the second lock on the same door.
      if (order.mock) {
        throw new Error("PAYMENTS_UNAVAILABLE");
      }
      await new Promise<void>((resolve, reject) => {
        openRazorpayCheckout({
          keyId: order.keyId || RAZORPAY_KEY_ID,
          amountPaise: order.amountPaise,
          currency: order.currency,
          name: "Homekrafted",
          description: "Wallet top-up",
          orderId: order.razorpayOrderId,
          prefill: { name: user?.name, email: user?.email, contact: user?.phone },
          onSuccess: () => {
            refreshFromServer().then(resolve).catch(reject);
          },
          onDismiss: () => reject(new Error("Top-up cancelled")),
        }).catch(reject);
      });
    },
    [mock, refreshFromServer, user],
  );

  const pay = useCallback(
    async (amount: number, ref: WalletTxnRef): Promise<PayResult> => {
      if (amount <= 0) return { ok: true };

      if (mock) {
        if (state.balance < amount) return { ok: false };
        setState((current) => {
          if (current.balance < amount) return current;
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

          // Auto-top-up deliberately does NOT fire here. The server stopped
          // crediting it (`WalletService#maybeFireAutoTopupTx`) because the
          // credit had no payment behind it; a mock that still mints balance
          // would show a different wallet in `NEXT_PUBLIC_USE_MOCK=true` than
          // the one real users get, which is exactly how the original bug
          // stayed invisible.
          return { ...current, balance: afterPay, transactions };
        });
        return { ok: true };
      }

      if (ref.refType !== "order" || !ref.refId) return { ok: false };
      try {
        // Keyed on the order, which is the whole point: paying the same
        // order twice must replay, never double-debit. `payOrder` has
        // accepted a key since M8 and no caller had ever sent one, so the
        // only protection was the `pending_payment` status check — which
        // holds for a sequential retry but not for two requests in flight.
        await payOrder(ref.refId, `order-pay-${ref.refId}`);
        await refreshFromServer();
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, message: err.message };
        return { ok: false };
      }
    },
    [mock, state.balance, refreshFromServer],
  );

  const earnCashback = useCallback(
    (amount: number, ref: WalletTxnRef) => {
      if (amount <= 0) return;
      if (!mock) {
        void refreshFromServer();
        return;
      }
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
    },
    [mock, refreshFromServer],
  );

  const refund = useCallback(
    (amount: number, ref: WalletTxnRef) => {
      if (amount <= 0) return;
      if (!mock) {
        void refreshFromServer();
        return;
      }
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
    },
    [mock, refreshFromServer],
  );

  const earnReferralCredit = useCallback(
    (amount: number, ref: WalletTxnRef) => {
      if (amount <= 0) return;
      if (!mock) {
        void refreshFromServer();
        return;
      }
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
    },
    [mock, refreshFromServer],
  );

  /**
   * The optimistic merge here now **reverts on failure**. It used to
   * swallow the error, which was harmless while the server accepted every
   * rule — but the server refuses `enabled: true` outright now
   * (auto-top-up credits nothing until it sits behind a real payment
   * mandate), so an un-reverted optimistic update would leave the UI
   * claiming a rule is on that the server rejected.
   */
  const setAutoTopup = useCallback(
    (patch: Partial<AutoTopupRule>) => {
      let previous: AutoTopupRule | undefined;
      setState((current) => {
        previous = current.autoTopup;
        return { ...current, autoTopup: { ...current.autoTopup, ...patch } };
      });
      if (!mock) {
        updateAutoTopupRule(patch)
          .then((updated) => setState((current) => ({ ...current, autoTopup: updated })))
          .catch(() => {
            if (previous) {
              const reverted = previous;
              setState((current) => ({ ...current, autoTopup: reverted }));
            }
          });
      }
    },
    [mock],
  );

  const refresh = useCallback(() => {
    if (mock) return;
    void refreshFromServer();
  }, [mock, refreshFromServer]);

  const value: WalletContextValue = {
    balance: state.balance,
    pendingCashback: state.pendingCashback,
    lifetimeSaved: state.lifetimeSaved,
    transactions: state.transactions,
    hasMoreTransactions: state.transactionsCursor !== null,
    loadMoreTransactions,
    autoTopup: state.autoTopup,
    ready,
    topUp,
    pay,
    earnCashback,
    refund,
    earnReferralCredit,
    setAutoTopup,
    refresh,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
