import type { AutoTopupRule, Wallet, WalletTransaction } from "@/lib/types";

/**
 * Single demo wallet (`user-demo`). Balance is the anchor value the
 * transaction ledger below reconciles against — see the inline math.
 */
export const wallet: Wallet = {
  id: "wallet-demo",
  userId: "user-demo",
  balance: 1250,
  pendingCashback: 85,
  lifetimeSaved: 1940,
  payWithWalletDefault: true,
  updatedAt: "2026-07-23T09:00:00+05:30",
};

/**
 * The 8 ledger rows from the Wallet screen, newest first — covers all 6
 * `WalletTransactionCategory` values (topup, cashback, refund, payment,
 * referral, loyalty) per M6's brief. `balanceAfter` is reconciled
 * backwards from the current balance (₹1,250) so the running total is
 * internally consistent — the prototype only shipped 6 of these rows (no
 * refund/loyalty samples), so M6 added one of each in date order without
 * disturbing the original 6's relative amounts:
 *
 *   1250 → (-42) → 1208 → (-150) → 1058 → (-1000) → 58 → (+560) → 618
 *        → (-50) → 568 → (-100) → 468 → (+1499) → 1967 → (-75) → 1892 (opening balance)
 */
export const walletTransactions: WalletTransaction[] = [
  {
    id: "wt1",
    walletId: "wallet-demo",
    direction: "credit",
    category: "cashback",
    amount: 42,
    balanceAfter: 1250,
    title: "Cashback — Order #HK2043",
    refType: "order",
    refId: "HK2043",
    createdAt: "2026-07-18",
  },
  {
    id: "wt7",
    walletId: "wallet-demo",
    direction: "credit",
    category: "refund",
    amount: 150,
    balanceAfter: 1208,
    title: "Refund — Order #HK2031 (cancelled)",
    refType: "order",
    refId: "HK2031",
    createdAt: "2026-07-17",
  },
  {
    id: "wt2",
    walletId: "wallet-demo",
    direction: "credit",
    category: "topup",
    amount: 1000,
    balanceAfter: 1058,
    title: "Wallet top-up",
    refType: "topup",
    createdAt: "2026-07-15",
  },
  {
    id: "wt3",
    walletId: "wallet-demo",
    direction: "debit",
    category: "payment",
    amount: 560,
    balanceAfter: 58,
    title: "Paid — Dry Fruit Laddoo Box",
    refType: "order",
    createdAt: "2026-07-15",
  },
  {
    id: "wt8",
    walletId: "wallet-demo",
    direction: "credit",
    category: "loyalty",
    amount: 50,
    balanceAfter: 618,
    title: "Loyalty points redeemed for wallet credit",
    refType: "loyalty",
    createdAt: "2026-07-12",
  },
  {
    id: "wt4",
    walletId: "wallet-demo",
    direction: "credit",
    category: "referral",
    amount: 100,
    balanceAfter: 568,
    title: "Referral credit — Priya",
    refType: "referral",
    createdAt: "2026-07-10",
  },
  {
    id: "wt5",
    walletId: "wallet-demo",
    direction: "debit",
    category: "payment",
    amount: 1499,
    balanceAfter: 468,
    title: "Paid — Festive Hamper",
    refType: "order",
    createdAt: "2026-07-02",
  },
  {
    id: "wt6",
    walletId: "wallet-demo",
    direction: "credit",
    category: "cashback",
    amount: 75,
    balanceAfter: 1967,
    title: "Cashback — Order #HK1987",
    refType: "order",
    refId: "HK1987",
    createdAt: "2026-07-02",
  },
];

/** Add-money amount picker tiles. */
export const topupOptions: number[] = [500, 1000, 2000, 5000];

/**
 * Seeded auto-top-up rule (M6) — off by default (never auto-charge
 * without explicit opt-in), `below-threshold` trigger. The Wallet
 * screen's editor mutates a client-side copy of this via
 * `WalletContext.setAutoTopup`; there's no server persistence yet.
 */
export const defaultAutoTopupRule: AutoTopupRule = {
  id: "atr-wallet-demo",
  walletId: "wallet-demo",
  enabled: false,
  trigger: "below-threshold",
  thresholdAmount: 300,
  topupAmount: 1000,
};
