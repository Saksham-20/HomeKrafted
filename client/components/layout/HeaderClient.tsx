"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Heart, Menu, ShieldCheck, ShoppingCart, Store, User, Wallet } from "lucide-react";
import { SearchForm } from "@/components/search/SearchForm";
import { formatCurrency } from "@/lib/format";
import type { NavLink } from "@/lib/data";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCart } from "@/lib/cart/CartContext";
import { useWallet } from "@/lib/wallet/WalletContext";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { MobileDrawer } from "./MobileDrawer";
import styles from "./Header.module.css";

/** One row of a tab's dropdown panel (M56). */
export interface NavMenuLink {
  href: string;
  label: string;
}

export interface HeaderClientProps {
  /** The catalogue destinations — the only ones the desktop row renders (M34). */
  navItems: NavLink[];
  /** The non-catalogue ways in; drawer-only up here, since the desktop row has no width for them. See `secondaryNav` in `lib/data/site.ts`. */
  secondaryItems: NavLink[];
  /** Dropdown rows per tab, keyed by the tab's href — built server-side in `Header.tsx` from the live category/occasion tables. */
  navMenus?: Record<string, NavMenuLink[]>;
}

/**
 * Interactive header shell. Fed pre-fetched mock data by the server
 * component in `Header.tsx` (data fetching stays server-side; only the
 * hamburger/drawer open state needs to be a client component). The cart
 * badge count (M3), wallet chip balance (M6), and wishlist badge count
 * (M7a) come straight from `useCart()`/`useWallet()`/`useWishlist()` —
 * real client state, not server-fetched props — so they update instantly
 * anywhere `addItem`/`pay`/`topUp`/`toggle` etc. is called, on this page
 * or after navigating. Until `useWallet()` finishes its post-mount
 * hydration, the chip shows "…" rather than a misleading ₹0 (see
 * `WalletContext`'s `ready` flag).
 *
 * **Seller dual-mode (M8.5)**: this header only ever renders on consumer
 * routes (`ConsumerChrome` swaps to `SellerShell` on `/seller/*`), so any
 * render of it with `role === "seller"` means that seller is currently in
 * shopping mode. The `sellerModePill` keeps `sellerMode` in sync (in case
 * they arrived via a direct link/back-forward rather than the toggle
 * itself) and offers the reverse switch back to their dashboard — see
 * `SellerShell`'s matching "Switch to shopping" for the other direction.
 */
export function HeaderClient({ navItems, secondaryItems, navMenus }: HeaderClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  /**
   * The landing page's header is a different object (owner, 2026-08-27,
   * M52): no search field, no wallet chip — only the profile icons,
   * floating over the hero — and the tabs are centred. It is
   * `position: fixed` and transparent at the top, so the hero can be one
   * full screen with nothing above it. The logo is in the row from first
   * paint but invisible until the hero lockup (the page's `<h1>`) has
   * scrolled past — then it fades in as the bar turns solid, so the
   * wordmark reads as moving into the bar (owner, 2026-08-31, M56). The
   * same `data-revealed` drives both; see Header.module.css. Every other
   * route keeps the ordinary row: logo, tabs, search, wallet, icons,
   * static. `usePathname` is known on the server, so the two renders
   * agree.
   */
  const onLanding = pathname === "/";
  const [revealed, setRevealed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!onLanding) return;
    // Watch the hero's brand block; the bar turns solid and shows the tabs
    // the moment it leaves the top 64px of the viewport (the bar's own
    // height, so the lockup is never half-covered at the hand-over).
    const target = document.getElementById("hk-hero-brand");
    if (target && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        ([entry]) => setRevealed(!entry.isIntersecting),
        { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
      );
      observer.observe(target);
      return () => observer.disconnect();
    }
    // No brand block on the page (a future landing without the hero):
    // fall back to plain scroll distance so the tabs are never unreachable.
    const onScroll = () => setRevealed(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onLanding]);
  const { count: cartCount } = useCart();
  const { balance: walletBalance, ready: walletReady } = useWallet();
  const { count: wishlistCount } = useWishlist();
  const { role, ready: authReady, switchToShopping, switchToSelling } = useAuth();
  const isSeller = authReady && role === "seller";
  // Admin has no persisted "mode" the way a seller does — `AdminShell`'s
  // "View site" is a plain link out, so the way back is a plain link too.
  const isAdmin = authReady && role === "admin";

  // This header only renders on a non-`/seller` route (see the doc
  // comment above) — a seller landing here (any way other than the
  // toggle below) is, by definition, shopping. Keeps the persisted
  // `sellerMode` honest for `SellerShell`'s toggle label after the user
  // switches back.
  useEffect(() => {
    if (isSeller) switchToShopping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller]);

  function handleSwitchToSelling() {
    switchToSelling();
    router.push("/seller");
  }

  /*
   * The catalogue strip. One node, two homes (2026-09-05).
   *
   * On `/` it stays where M52 put it: centred in the single floating bar
   * over the hero, absolutely positioned so it shares the row with
   * nothing. On every other route it is the header's **second row** —
   * see `.navBar` — which is what made the owner's six-item nav possible
   * at all. The old single row had 1092px for the lockup, six labels, a
   * typable search field and five controls, and it demonstrably could not
   * hold them: `e2e/tests/header-capacity.spec.ts` exists because that
   * exact set rendered a 0px-wide search box at every width from 1190 to
   * 1920. Splitting the rows removes the competition rather than
   * re-refereeing it.
   *
   * Each tab is still a plain link to its hub; the dropdown (M56) is a
   * shortcut panel revealed on hover or focus-within — CSS-only,
   * absolutely positioned, so it takes no width from the row it sits in
   * and keyboard users reach every entry by tabbing through it.
   */
  const nav = (
    <nav className={styles.nav} aria-label="Primary">
      {navItems.map((item) => {
        const menu = navMenus?.[item.href];
        return (
          <div key={item.href + item.label} className={styles.navItem}>
            <Link href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
            {menu && menu.length > 0 && (
              <div className={styles.navMenu}>
                <div className={styles.navMenuPanel}>
                  {menu.map((link) => (
                    <Link
                      key={link.href + link.label}
                      href={link.href}
                      className={styles.navMenuLink}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <header
      className={clsx(styles.header, onLanding && styles.landing)}
      data-revealed={onLanding ? String(revealed) : undefined}
    >
      <div className={clsx("container", "container-wide", styles.row)}>
        {/* Rendered on every route, the landing page included — there it
            starts invisible (opacity 0 + visibility hidden, so it also
            leaves the tab order) and appears with `data-revealed` once the
            hero lockup scrolls out. Always in the flex row so nothing
            reflows when it shows. */}
        <Link href="/" className={styles.logo} aria-label="Homekrafted — home">
          {/* The tagline row ("Home food · Tricity") left with the compact
              header (2026-08-27) — the hero's eyebrow now states the same
              locality under the big lockup, and two copies 40px apart was
              the redundancy, not the information. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand
              lockup is a fixed vector; next/image adds no value for an SVG. */}
          <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
        </Link>

        {onLanding && nav}

        {/* Was a `<Link href="/shop">` dressed as a search box — a dead
            affordance, since nothing in the app could search. Real form
            now; the pill styling moved into `SearchForm.module.css`.

            **It is a sibling of the actions run, not a member of it
            (2026-09-05).** While the nav shared this row the field was
            the last thing in a queue of controls and got whatever they
            left — which for a long time was nothing (a 0px input; see
            `header-capacity.spec.ts`). With the tabs on their own row it
            is the row's middle and takes the slack, which is the shape
            every catalogue site uses and the reason it can now be wide
            enough to read a query back to you.

            Not on the landing page (M52): search is a browsing tool, and
            the drawer still carries one for a phone. */}
        {!onLanding && (
          <div className={styles.searchSlot}>
            <SearchForm className={styles.searchPill} />
          </div>
        )}

        <div className={styles.actions}>
          {/* Icon-only, and the label is a real accessible name rather than
              a visible one. The labelled version was 147px wide and the
              header row has no 147px to give — with it in place the row
              overran the 1180px container by 145px, which put the cart
              icon 59px off the right edge of a 1280px screen where
              `overflow-x: hidden` made it unreachable rather than merely
              ugly. The affordance stays discoverable three other ways:
              the `title` tooltip here, the drawer's labelled "Switch to
              selling" row below 1190px, and `SellerShell`'s own "Switch
              to shopping" mirror on the other side of the toggle. */}
          {isSeller && (
            <button
              type="button"
              className={clsx(styles.sellerModePill, styles.hideOnMobile)}
              onClick={handleSwitchToSelling}
              aria-label="Switch to selling"
              title="Switch to selling"
            >
              <Store size={16} strokeWidth={1.7} />
            </button>
          )}

          {/* The admin mirror of the seller pill above, same reasoning for
              being icon-only (the row has no width for a label) and the
              same three-way discoverability: `title` tooltip here, the
              labelled drawer row below 1190px, and `AdminShell`'s "View
              site" on the other side. A `Link`, not a button — there is no
              mode state to flip, `/admin` is just a place. */}
          {isAdmin && (
            <Link
              href="/admin"
              className={clsx(styles.sellerModePill, styles.hideOnMobile)}
              aria-label="Switch to admin panel"
              title="Switch to admin panel"
            >
              <ShieldCheck size={16} strokeWidth={1.7} />
            </Link>
          )}

          {/* The amount is hidden below the mobile breakpoint, which left
              this link with an icon and no accessible name at all — a
              screen reader announced "link". The label names the
              destination and carries the balance where it is known, so it
              says the same thing at both widths. */}
          {!onLanding && (
            <Link
              href="/wallet"
              className={styles.walletChip}
              aria-label={walletReady ? `Wallet, ${formatCurrency(walletBalance)}` : "Wallet"}
            >
              <Wallet size={17} strokeWidth={1.7} />
              <span className={styles.walletAmount}>
                {walletReady ? formatCurrency(walletBalance) : "…"}
              </span>
            </Link>
          )}

          <Link
            href="/account/wishlist"
            className={clsx(styles.utilityIcon, styles.hideOnMobile, styles.wishlistButton)}
            aria-label={`Wishlist, ${wishlistCount} item${wishlistCount === 1 ? "" : "s"}`}
          >
            <Heart size={21} strokeWidth={1.6} />
            {wishlistCount > 0 ? <span className={styles.wishlistBadge}>{wishlistCount}</span> : null}
          </Link>

          <Link
            href="/account/profile"
            className={clsx(styles.utilityIcon, styles.hideOnMobile)}
            aria-label="Account"
          >
            <User size={21} strokeWidth={1.6} />
          </Link>

          <Link
            href="/cart"
            className={clsx(styles.utilityIcon, styles.cartButton)}
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <ShoppingCart size={21} strokeWidth={1.6} />
            {cartCount > 0 ? <span className={styles.cartBadge}>{cartCount}</span> : null}
          </Link>

          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/*
        The catalogue row (2026-09-05). Full-bleed ground, its own
        hairline, the same wide container as the row above so the tabs
        line up under the lockup.

        Only on inner routes: `/`'s bar floats over the hero and carries
        the tabs centred in its single row (M52), and a second strip
        under a transparent bar would be two washes over the same
        photograph.

        It is hidden at the same 1190px the tabs always were — below that
        the drawer is the navigation, and it now carries all six.
      */}
      {!onLanding && (
        <div className={styles.navBar}>
          <div className={clsx("container", "container-wide", styles.navBarInner)}>{nav}</div>
        </div>
      )}

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        navItems={navItems}
        secondaryItems={secondaryItems}
        walletBalance={walletReady ? walletBalance : undefined}
        onSwitchToSelling={isSeller ? handleSwitchToSelling : undefined}
        showAdminSwitch={isAdmin}
      />
    </header>
  );
}
