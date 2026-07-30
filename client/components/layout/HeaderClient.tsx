"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Heart, Menu, Search, ShoppingCart, Store, User, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { NavLink } from "@/lib/data";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCart } from "@/lib/cart/CartContext";
import { useWallet } from "@/lib/wallet/WalletContext";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { MobileDrawer } from "./MobileDrawer";
import styles from "./Header.module.css";

export interface HeaderClientProps {
  navItems: NavLink[];
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
export function HeaderClient({ navItems }: HeaderClientProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { count: cartCount } = useCart();
  const { balance: walletBalance, ready: walletReady } = useWallet();
  const { count: wishlistCount } = useWishlist();
  const { role, ready: authReady, switchToShopping, switchToSelling } = useAuth();
  const isSeller = authReady && role === "seller";

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
    <header className={styles.header}>
      <div className={clsx("container", styles.row)}>
        <Link href="/" className={styles.logo} aria-label="Homekrafted — home">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand
              lockup is a fixed vector; next/image adds no value for an SVG. */}
          <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
          <span className={styles.tagline}>Home food · Tricity</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.href + item.label} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          {isSeller && (
            <button
              type="button"
              className={clsx(styles.sellerModePill, styles.hideOnMobile)}
              onClick={handleSwitchToSelling}
            >
              <Store size={16} strokeWidth={1.7} />
              <span>Switch to selling</span>
            </button>
          )}

          <Link href="/shop" className={styles.searchPill} aria-label="Search homemade products">
            <Search size={17} strokeWidth={1.7} />
            <span>Search homemade…</span>
          </Link>

          <Link href="/wallet" className={styles.walletChip}>
            <Wallet size={17} strokeWidth={1.7} />
            <span className={styles.walletAmount}>
              {walletReady ? formatCurrency(walletBalance) : "…"}
            </span>
          </Link>

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
        walletBalance={walletReady ? walletBalance : undefined}
        onSwitchToSelling={isSeller ? handleSwitchToSelling : undefined}
      />
    </header>
  );
}
