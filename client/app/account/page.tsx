import { getAddresses, getOrderHistory } from "@/lib/api";
import { AccountOverviewClient } from "@/components/account/AccountOverviewClient";

/**
 * Account overview (M7a) — server wrapper: fetches the seeded order-
 * history count and address-book count (real reads, cheap and stable),
 * hands off to the client overview for the auth/wallet/wishlist-dependent
 * bits (greeting, wallet balance snapshot, wishlist count) that only
 * exist as client state pre-M8.
 */
export default async function AccountOverviewPage() {
  const [orderHistory, addresses] = await Promise.all([getOrderHistory(), getAddresses()]);

  return <AccountOverviewClient orderCount={orderHistory.length} addressCount={addresses.length} />;
}
