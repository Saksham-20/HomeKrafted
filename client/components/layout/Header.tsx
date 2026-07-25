import { getPrimaryNav } from "@/lib/api";
import { HeaderClient } from "./HeaderClient";

/**
 * Server wrapper: fetches nav from the mock `lib/api` layer, then hands
 * plain serialisable props to the interactive client header. The cart
 * badge (M3) and wallet chip (M6) are no longer fetched here — `HeaderClient`
 * reads them straight from `useCart()`/`useWallet()` since both are real
 * cross-page client state now. Swapping `lib/api` for real fetches in M8
 * doesn't touch this component.
 */
export async function Header() {
  const navItems = await getPrimaryNav();

  return <HeaderClient navItems={navItems} />;
}
