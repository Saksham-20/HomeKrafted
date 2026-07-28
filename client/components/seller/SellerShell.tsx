"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  LayoutGrid,
  LogOut,
  Package,
  ShoppingBag,
  Star,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import type { SellerType } from "@/lib/types";
import styles from "./SellerShell.module.css";

interface SellerNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
}

/** M10a's nav set — maker-only modules (Listings/Storefront/Reviews sit alongside the shared Orders/Payouts). */
const MAKER_NAV: SellerNavItem[] = [
  { label: "Dashboard", href: "/seller", icon: LayoutGrid },
  { label: "Listings", href: "/seller/listings", icon: Package },
  { label: "Orders", href: "/seller/orders", icon: ShoppingBag },
  { label: "Storefront", href: "/seller/storefront", icon: Store },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
  { label: "Reviews", href: "/seller/reviews", icon: Star },
];

/** M10b — laundry partner: no listings/storefront/reviews (those are maker-only concepts), "Pickups" replaces "Orders". */
const LAUNDRY_NAV: SellerNavItem[] = [
  { label: "Dashboard", href: "/seller", icon: LayoutGrid },
  { label: "Pickups", href: "/seller/pickups", icon: Truck },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
];

/** M10b — snack seller: "Menu" (CRUD over their `Snack`s) instead of maker Listings, "Orders" here means incoming WhatsApp-origin `SnackOrder`s (see `SnackOrdersClient`), not marketplace `Order`s. */
const SNACK_NAV: SellerNavItem[] = [
  { label: "Dashboard", href: "/seller", icon: LayoutGrid },
  { label: "Menu", href: "/seller/menu", icon: UtensilsCrossed },
  { label: "Orders", href: "/seller/orders", icon: ShoppingBag },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
];

function navForType(type: SellerType | undefined): SellerNavItem[] {
  switch (type) {
    case "laundry":
      return LAUNDRY_NAV;
    case "snack":
      return SNACK_NAV;
    case "maker":
    default:
      return MAKER_NAV;
  }
}

/**
 * Seller portal shell (M10a) — `app/seller/(dashboard)/layout.tsx` wraps
 * every shelled seller route in this. Deliberately its own chrome, not a
 * reskin of the consumer `Header`/`Footer` (`ConsumerChrome` hides those
 * on `/seller/*` entirely, see `components/layout/ConsumerChrome.tsx`):
 * a pine-deep topbar (seller identity, "view site", sign out) over a nav
 * that's a sticky left sidebar on desktop and collapses to the same
 * horizontal scroll-tab-strip technique `AccountShell` uses below ~780px
 * — no separate drawer state needed, one fewer thing to get wrong on
 * mobile. Nav items are driven by `seller.type` (`navForType`) so M10b's
 * laundry/snack sellers reuse this exact shell.
 *
 * Gates on `useAuth()` client-side as a defensive fallback —
 * `middleware.ts` is the primary gate (redirects a non-seller request to
 * `/login?role=seller` before this ever renders) — this only covers the
 * brief window before `ready` flips true post-hydration, or a role that
 * changed in another tab.
 *
 * **Dual-mode toggle (M8.5)**: the topbar's former "View site" link is
 * now "Switch to shopping" — it flips `useAuth().sellerMode` to
 * `"shopping"` (persisted, survives reload — see `AuthContext`'s file
 * header) *before* navigating home, so the consumer chrome that renders
 * at `/` already reflects the new mode rather than the toggle looking
 * like a no-op for one render. There's a matching "Switch to selling"
 * pill in `HeaderClient`/`MobileDrawer` for the reverse direction — both
 * read/write the same one `role === "seller"` session, no re-login.
 */
export function SellerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, isSignedIn, role, user, seller, switchToShopping, switchToSelling, signOut } = useAuth();

  // Keep the persisted `sellerMode` honest for anyone who lands on a
  // `/seller/*` page directly (bookmark, back/forward, a link elsewhere)
  // rather than via the shopping-side toggle — see `HeaderClient`'s
  // matching effect for the reverse direction.
  useEffect(() => {
    if (ready && isSignedIn && role === "seller") switchToSelling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSignedIn, role]);

  if (ready && (!isSignedIn || role !== "seller" || !seller)) {
    return (
      <section className={clsx("container", styles.gatePage)}>
        <div className={styles.gateCard}>
          <span className={styles.eyebrow}>Seller portal</span>
          <h1 className={styles.gateTitle}>Sign in as a seller</h1>
          <p className={styles.gateCopy}>
            You need a seller account to view this page.
          </p>
          <Button variant="primary" onClick={() => router.push("/login?role=seller")}>
            Go to seller sign-in
          </Button>
        </div>
      </section>
    );
  }

  const navItems = navForType(seller?.type);

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  function handleSwitchToShopping() {
    switchToShopping();
    router.push("/");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={clsx("container", styles.topbarRow)}>
          <Link href="/seller" className={styles.logo}>
            Home<span className={styles.krafted}>krafted</span>
            <span className={styles.portalTag}>Seller</span>
          </Link>
          <div className={styles.topbarActions}>
            <span className={styles.sellerName}>
              {seller?.displayName ?? user?.name ?? "Seller"}
            </span>
            <button type="button" onClick={handleSwitchToShopping} className={styles.viewSiteLink}>
              Switch to shopping
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSignOut}
              className={styles.signOutButton}
            >
              <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className={clsx("container", styles.body)}>
        <nav className={clsx(styles.sidebar, "hk-scroll")} aria-label="Seller">
          {navItems.map((item) => {
            const active =
              item.href === "/seller" ? pathname === "/seller" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(styles.navItem, active && styles.navItemActive)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
