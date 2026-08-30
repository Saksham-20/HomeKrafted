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

export interface HeaderClientProps {
  /** The catalogue destinations — the only ones the desktop row renders (M34). */
  navItems: NavLink[];
  /** The non-catalogue ways in; drawer-only up here, since the desktop row has no width for them. See `secondaryNav` in `lib/data/site.ts`. */
  secondaryItems: NavLink[];
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
export function HeaderClient({ navItems, secondaryItems }: HeaderClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  /**
   * The landing page's header is a different object (owner, 2026-08-27,
   * M52): no logo (the lockup is the page's `<h1>`), no search field, no
   * wallet chip — only the profile icons, floating over the hero — and
   * the tabs appear, centred, once the brand block has scrolled out. It
   * is `position: fixed` and transparent at the top, so the hero can be
   * one full screen with nothing above it. Every other route keeps the
   * ordinary row: logo, tabs, search, wallet, icons, static.
   * `usePathname` is known on the server, so the two renders agree.
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

  return (
    <header
      className={clsx(styles.header, onLanding && styles.landing)}
      data-revealed={onLanding ? String(revealed) : undefined}
    >
      <div className={clsx("container", styles.row)}>
        {!onLanding && (
          <Link href="/" className={styles.logo} aria-label="Homekrafted — home">
            {/* The tagline row ("Home food · Tricity") left with the compact
                header (2026-08-27) — the hero's eyebrow now states the same
                locality under the big lockup, and two copies 40px apart was
                the redundancy, not the information. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- the brand
                lockup is a fixed vector; next/image adds no value for an SVG. */}
            <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
          </Link>
        )}

        <nav className={styles.nav} aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.href + item.label} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

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

          {/* Was a `<Link href="/shop">` dressed as a search box — a dead
              affordance, since nothing in the app could search. Real form
              now; the pill styling moved into `SearchForm.module.css`.

              The wrapper is load-bearing, not tidiness. The row has room
              for about 38px of search (see `.searchSlot`), so the field
              expands over the nav on focus — and expanding means going
              `position: absolute`, which takes it out of the flex line.
              Without a slot holding the 38px open, the wallet chip and
              the three icons all jump 46px left the instant the caret
              lands, and back again on blur. The slot keeps the flow
              width; only the form moves. */}
          {/* Not on the landing page (M52): search is a browsing tool, and
              the drawer still carries one for a phone. */}
          {!onLanding && (
            <div className={styles.searchSlot}>
              <SearchForm className={styles.searchPill} />
            </div>
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
