import type { AutoTopupRule, Wallet, WalletTransaction } from "@/lib/types";
import { defaultAutoTopupRule, topupOptions, wallet, walletTransactions } from "@/lib/data";

export async function getWallet(): Promise<Wallet> {
  return wallet;
}

export async function getTransactions(): Promise<WalletTransaction[]> {
  return walletTransactions;
}

export async function getTopupOptions(): Promise<number[]> {
  return topupOptions;
}

/** Seeded auto-top-up rule — `WalletContext` hydrates its initial state from this. */
export async function getAutoTopupRule(): Promise<AutoTopupRule> {
  return defaultAutoTopupRule;
}
