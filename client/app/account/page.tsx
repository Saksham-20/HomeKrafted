import { AccountOverviewClient } from "@/components/account/AccountOverviewClient";

/**
 * Account overview (M7a; M8.4a swap) — `getOrderHistory()`/`getAddresses()`
 * are owner-scoped real reads now, so `AccountOverviewClient` fetches its
 * own order/address counts on mount instead of this page fetching them
 * server-side (same reasoning as `OrdersListClient` pre-M8.4 — see
 * `lib/auth/session.ts`'s file header).
 */
export default function AccountOverviewPage() {
  return <AccountOverviewClient />;
}
