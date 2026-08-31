import { getCategories, getOccasions, getPrimaryNav, getSecondaryNav } from "@/lib/api";
import { HeaderClient, type NavMenuLink } from "./HeaderClient";

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
  const [navItems, secondaryItems, categories, occasions] = await Promise.all([
    getPrimaryNav(),
    getSecondaryNav(),
    getCategories(),
    getOccasions(),
  ]);

  /**
   * Dropdown panels under the three catalogue tabs (M56, owner: "the
   * buttons already are there — add different things there"). Built here
   * so the links come from the live category/occasion tables rather than
   * a second hand-kept list, and keyed by the tab's href so a renamed
   * label keeps its menu. Absolutely positioned in CSS — the row's
   * 1092px capacity arithmetic is untouched.
   *
   * Six category rows a side, not the whole table: a dropdown is a
   * shortcut, and `/shop`'s sidebar is where the full list lives.
   */
  const foodCategories = categories.filter((c) => c.group !== "craft").slice(0, 6);
  const craftCategories = categories.filter((c) => c.group === "craft");
  // The first handful in table order — deliberately not "next upcoming",
  // which would need the clock during SSR (the M12 React #418 rule).
  const menuOccasions = occasions.slice(0, 6);

  const navMenus: Record<string, NavMenuLink[]> = {
    "/shop": [
      { href: "/shop", label: "Browse kitchens" },
      { href: "/shop?view=dishes", label: "All dishes" },
      ...foodCategories.map((c) => ({ href: `/shop?category=${c.slug}`, label: c.name })),
      { href: "/shop?ship=national", label: "Ships pan-India" },
      { href: "/snacks", label: "Snacks on WhatsApp" },
    ],
    "/gifts": [
      { href: "/gifts", label: "All gifts" },
      ...craftCategories.map((c) => ({ href: `/gifts?category=${c.slug}`, label: c.name })),
      { href: "/hamper", label: "Gift hampers" },
      { href: "/gifts?sale=1", label: "On sale" },
    ],
    "/collections": [
      ...menuOccasions.map((o) => ({ href: `/collections/${o.slug}`, label: o.name })),
      { href: "/collections", label: "All occasions & guides" },
    ],
  };

  return (
    <HeaderClient navItems={navItems} secondaryItems={secondaryItems} navMenus={navMenus} />
  );
}
