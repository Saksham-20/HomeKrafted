import { getPrimaryNav, getSecondaryNav } from "@/lib/api";
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
  // Two lists since M34: the desktop row shows only `navItems` (the three
  // catalogues), while the drawer shows both groups — a phone has the
  // room the 1092px desktop row does not, and dropping the secondary
  // group there would leave the footer as the only way to reach
  // /corporate or /meal-plans on mobile.
  const [navItems, secondaryItems] = await Promise.all([getPrimaryNav(), getSecondaryNav()]);

  return <HeaderClient navItems={navItems} secondaryItems={secondaryItems} />;
}
