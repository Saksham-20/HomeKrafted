import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategories,
  getMealPromo,
  getOccasions,
  getProducts,
  getSnacks,
  getTopupOptions,
  getTransactions,
  getVendors,
  getWallet,
} from "@/lib/api";
import type { Wallet } from "@/lib/types";
import { GalleryClient } from "./GalleryClient";

/** Stand-in for the signed-out case — see the `.catch()` at the fetch below. */
const EMPTY_WALLET: Wallet = {
  id: "gallery-placeholder",
  userId: "gallery-placeholder",
  balance: 0,
  pendingCashback: 0,
  lifetimeSaved: 0,
  payWithWalletDefault: true,
  updatedAt: new Date(0).toISOString(),
};

/**
 * DEV-ONLY component gallery (M1).
 *
 * Renders every components/ui/ primitive in every documented state
 * (default / hover / selected / disabled, where each applies) against
 * real mock data, for visual QA against `handoff/prototype/Homekrafted.dc.html`.
 * Not linked from any nav — reachable only by visiting `/gallery`
 * directly, and only outside production (see the `notFound()` guard
 * below). Safe to delete once every screen milestone (M2-M7) has
 * shipped and exercised these primitives in situ.
 *
 * Server component: fetches everything through `lib/api` (never
 * `lib/data` directly, per the project convention) and hands resolved
 * data down to the interactive `<GalleryClient>`.
 */
/**
 * Never indexable: a dev-only primitives gallery that ships in the production bundle. `robots.ts` disallows the path too — this is
 * the belt to that braces, for the case where a crawler reaches the page
 * from an external link rather than by crawling the site.
 */
export const metadata: Metadata = {
  title: "Component gallery",
  robots: { index: false, follow: false },
};

export default async function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [
    products,
    vendors,
    snacks,
    categories,
    occasions,
    wallet,
    transactions,
    topupOptions,
    mealPromo,
  ] = await Promise.all([
    getProducts(),
    getVendors(),
    getSnacks(),
    getCategories(),
    getOccasions(),
    // `getWallet`/`getTransactions` are owner-scoped, and a Server
    // Component render carries no session — so both 401 and, unhandled,
    // took the whole page down with a 500 (found by the audit sweep;
    // production never saw it because the `notFound()` above runs first,
    // which is also why it went unnoticed). This screen exists to look at
    // primitives, so a wallet nobody is signed in to is an empty wallet,
    // not a crash.
    getWallet().catch(() => EMPTY_WALLET),
    getTransactions()
      .then((page) => page.items)
      .catch(() => []),
    getTopupOptions(),
    getMealPromo(),
  ]);

  const vendorNameById = Object.fromEntries(
    vendors.map((vendor) => [vendor.id, vendor.name]),
  );

  return (
    <GalleryClient
      products={products}
      vendorNameById={vendorNameById}
      snacks={snacks}
      categories={categories}
      occasions={occasions}
      wallet={wallet}
      transactions={transactions}
      topupOptions={topupOptions}
      mealPromo={mealPromo}
    />
  );
}
