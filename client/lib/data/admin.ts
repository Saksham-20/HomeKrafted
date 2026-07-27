import type { User, Wallet, WalletTransaction } from "@/lib/types";
import { currentUser } from "./user";
import { laundryPartnerUser, sellerUser, snackSellerUser } from "./sellers";
import { wallet as demoWallet, walletTransactions as demoWalletTransactions } from "./wallet";

/**
 * Admin-portal seed data (M11a). `adminUser` is the demo staff account
 * `signInAsAdmin()` (`lib/auth/AuthContext.tsx`) resolves to — a distinct
 * `User` (role `"admin"`), same "separate account per role surface"
 * convention `sellerUser`/`laundryPartnerUser`/`snackSellerUser`
 * established in M10a/M10b, not a permission flag toggled on the
 * consumer account.
 */
export const adminUser: User = {
  id: "user-admin-demo",
  name: "Priyanka Desai",
  email: "priyanka@homekrafted.example",
  phone: "+91 98111 22334",
  avatarPlaceholder: "PRIYANKA — AVATAR",
  authProviders: ["email"],
  createdAt: "2023-09-01",
  walletId: "wallet-admin-demo",
  loyaltyAccountId: "loyalty-admin-demo",
  referralCode: "PRIYANKA250",
  role: "admin",
};

/**
 * A few extra seeded consumer accounts purely so `/admin/users` has a
 * non-trivial list to search/filter/suspend — no other module
 * references these ids (no orders/wallets/reviews point at them), they
 * exist only to give the admin directory real body beyond the single
 * `currentUser` every other M0–M7 screen already reads. One
 * (`user-extra-2`) starts `suspended: true` so the list/detail screens
 * have a real suspended row to show on first load, not just the
 * reactivate direction.
 */
export const extraUsers: User[] = [
  {
    id: "user-extra-1",
    name: "Rhea Kapoor",
    email: "rhea.kapoor@example.com",
    phone: "+91 90111 22001",
    avatarPlaceholder: "RHEA — AVATAR",
    authProviders: ["phone", "email"],
    createdAt: "2025-09-14",
    walletId: "wallet-extra-1",
    loyaltyAccountId: "loyalty-extra-1",
    referralCode: "RHEA250",
    role: "consumer",
  },
  {
    id: "user-extra-2",
    name: "Farhan Sheikh",
    email: "farhan.sheikh@example.com",
    phone: "+91 90111 22002",
    avatarPlaceholder: "FARHAN — AVATAR",
    authProviders: ["phone"],
    createdAt: "2025-11-30",
    walletId: "wallet-extra-2",
    loyaltyAccountId: "loyalty-extra-2",
    referralCode: "FARHAN250",
    role: "consumer",
    suspended: true,
  },
  {
    id: "user-extra-3",
    name: "Nisha Verma",
    email: "nisha.verma@example.com",
    phone: "+91 90111 22003",
    avatarPlaceholder: "NISHA — AVATAR",
    authProviders: ["email"],
    createdAt: "2026-03-05",
    walletId: "wallet-extra-3",
    loyaltyAccountId: "loyalty-extra-3",
    referralCode: "NISHA250",
    role: "consumer",
  },
];

/**
 * The full unscoped user directory `/admin/users` reads from
 * (`lib/api/admin.ts#getAllUsers`) — every demo account across all 3
 * role surfaces (the one consumer, the 3 seller personas, admin itself)
 * plus the 3 extra seeded consumers above. Live array, not a fresh copy
 * per call: `setUserSuspended` mutates an entry in place, same
 * "mutate the shared record directly" pattern
 * `lib/api/seller.ts#updateSellerStorefront` uses on `Vendor` — so
 * suspending, say, `currentUser` here is visible anywhere else in the
 * app that reads that same imported `currentUser` object within the tab.
 */
export const users: User[] = [
  currentUser,
  sellerUser,
  laundryPartnerUser,
  snackSellerUser,
  adminUser,
  ...extraUsers,
];

// ---------------------------------------------------------------------------
// Per-user wallet ledger (M11b `/admin/wallet`) — the M6 Wallet screen only
// ever modelled the one demo consumer's wallet (`lib/data/wallet.ts`'s
// `wallet`/`walletTransactions`, keyed to `user-demo`); admin oversight
// needs a wallet per account to show real per-user balances/history and a
// place for `issueRefund`/`adjustWallet` to write to. Each entry below
// opens with one seed transaction whose `balanceAfter` equals the
// wallet's `balance`, so the ledger reconciles from a clean slate the
// same way `lib/data/wallet.ts`'s fuller 8-row ledger does.
//
// **Deliberately a separate ledger from `WalletContext`** (the consumer
// wallet store, `localStorage`-persisted client-side): this file is the
// *admin's* view/write surface over the mock wallet data, while
// `WalletContext` is the *consumer's* own live session state — the two
// can drift within one mock session exactly because there's no shared
// server yet. M8's real wallet ledger is one server-authoritative table
// both surfaces read/write through, closing that gap for good.
// ---------------------------------------------------------------------------

function seedWallet(id: string, userId: string, balance: number, lifetimeSaved: number): Wallet {
  return {
    id,
    userId,
    balance,
    pendingCashback: 0,
    lifetimeSaved,
    payWithWalletDefault: true,
    updatedAt: "2026-07-20T09:00:00+05:30",
  };
}

function seedOpeningTxn(walletId: string, balance: number, title: string): WalletTransaction {
  return {
    id: `wt-${walletId}-open`,
    walletId,
    direction: "credit",
    category: "topup",
    amount: balance,
    balanceAfter: balance,
    title,
    refType: "topup",
    createdAt: "2026-06-01",
  };
}

/** `User.id` → that user's `Wallet` — every account in `users` gets one, even the seller/admin personas (a real account always has a wallet, whether or not its owning screen surfaces it yet). */
export const adminWalletsByUser: Record<string, Wallet> = {
  "user-demo": demoWallet,
  "user-seller-demo": seedWallet("wallet-seller-demo", "user-seller-demo", 3200, 950),
  "user-seller-laundry-demo": seedWallet("wallet-seller-laundry-demo", "user-seller-laundry-demo", 800, 200),
  "user-seller-snack-demo": seedWallet("wallet-seller-snack-demo", "user-seller-snack-demo", 450, 60),
  "user-admin-demo": seedWallet("wallet-admin-demo", "user-admin-demo", 0, 0),
  "user-extra-1": seedWallet("wallet-extra-1", "user-extra-1", 620, 180),
  "user-extra-2": seedWallet("wallet-extra-2", "user-extra-2", 90, 40),
  "user-extra-3": seedWallet("wallet-extra-3", "user-extra-3", 1500, 300),
};

/** `User.id` → that user's ledger, newest first. */
export const adminWalletTransactionsByUser: Record<string, WalletTransaction[]> = {
  "user-demo": demoWalletTransactions,
  "user-seller-demo": [seedOpeningTxn("wallet-seller-demo", 3200, "Opening balance")],
  "user-seller-laundry-demo": [seedOpeningTxn("wallet-seller-laundry-demo", 800, "Opening balance")],
  "user-seller-snack-demo": [seedOpeningTxn("wallet-seller-snack-demo", 450, "Opening balance")],
  "user-admin-demo": [],
  "user-extra-1": [seedOpeningTxn("wallet-extra-1", 620, "Opening balance")],
  "user-extra-2": [seedOpeningTxn("wallet-extra-2", 90, "Opening balance")],
  "user-extra-3": [seedOpeningTxn("wallet-extra-3", 1500, "Opening balance")],
};
