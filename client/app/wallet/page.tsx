import type { Metadata } from "next";
import { getTopupOptions } from "@/lib/api";
import { WalletClient } from "@/components/wallet/WalletClient";

/**
 * Wallet (M6) — server wrapper: fetches the add-money preset amounts via
 * `lib/api` (real read-only reference data), hands off to the client
 * wallet screen. Every other value on this screen (balance, pending
 * cashback, lifetime saved, the transaction ledger, the auto-top-up rule)
 * comes from `useWallet()` — real client wallet state, not a server prop
 * — the same "the store is the deliberate pre-backend exception" pattern
 * `CartContext` established in M3.
 */
/**
 * Never indexable: a wallet is one person's balance and ledger. `robots.ts` disallows the path too — this is
 * the belt to that braces, for the case where a crawler reaches the page
 * from an external link rather than by crawling the site.
 */
export const metadata: Metadata = {
  title: "Wallet",
  robots: { index: false, follow: false },
};

export default async function WalletPage() {
  const topupOptions = await getTopupOptions();

  return <WalletClient topupOptions={topupOptions} />;
}
