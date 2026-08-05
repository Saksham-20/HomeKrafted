"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  CalendarClock,
  LayoutGrid,
  LogOut,
  Package,
  ShoppingBag,
  Star,
  Store,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./SellerShell.module.css";

interface SellerNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
}

/**
 * The one HomeKrafter nav — every module, shown to every HomeKrafter
 * regardless of their `Seller.type`.
 *
 * This replaced the three per-type nav sets M10a/M10b shipped
 * (`MAKER_NAV`/`LAUNDRY_NAV`/`SNACK_NAV`, each hiding the other types'
 * modules). A HomeKrafter is one account that can make, launder and cook,
 * so the portal now presents one combined surface rather than three
 * mutually exclusive ones. Each module screen still resolves its own data
 * from the caller's JWT-scoped seller id, so a HomeKrafter with nothing in
 * a given module simply sees that module's empty state.
 */
const HOMEKRAFTER_NAV: SellerNavItem[] = [
  { label: "Dashboard", href: "/seller", icon: LayoutGrid },
  // M16 (H6). Sits right after the dashboard: the dashboard answers
  // "what is happening today", this answers "what is selling, and when".
  { label: "Analytics", href: "/seller/analytics", icon: BarChart3 },
  { label: "Listings", href: "/seller/listings", icon: Package },
  { label: "Menu", href: "/seller/menu", icon: UtensilsCrossed },
  // M20. Sits with the other catalogue screens rather than under Orders:
  // a plan is something a kitchen offers, and the meals it owes hang off
  // it. Every HomeKrafter gets it, like every other module here — a plan
  // is no longer tied to being a meal, so "do you cook?" is not a
  // question this nav needs to answer.
  { label: "Meal plans", href: "/seller/meal-plans", icon: CalendarClock },
  { label: "Orders", href: "/seller/orders", icon: ShoppingBag },
  // Pickups removed in M19 with the rest of laundry. The ROUTE still
  // resolves on purpose: `POST /laundry/bookings` is now gone (410), so no
  // new bookings arrive, but anyone with one already in flight must still
  // be able to fulfil it. `SellerDashboardClient` shows a link to it when
  // they have outstanding pickups.
  { label: "Storefront", href: "/seller/storefront", icon: Store },
  // M16. Separate from Storefront on purpose: that page is the four
  // catalogue fields on every product card; this one is the story,
  // hours, policies and licence a buyer reads before trusting a kitchen.
  { label: "Profile", href: "/seller/profile", icon: UserRound },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
  { label: "Reviews", href: "/seller/reviews", icon: Star },
];

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
          <span className={styles.eyebrow}>HomeKrafter portal</span>
          <h1 className={styles.gateTitle}>Sign in as a HomeKrafter</h1>
          <p className={styles.gateCopy}>
            You need a HomeKrafter account to view this page.
          </p>
          <Button variant="primary" onClick={() => router.push("/login?role=seller")}>
            Go to HomeKrafter sign-in
          </Button>
        </div>
      </section>
    );
  }

  const navItems = HOMEKRAFTER_NAV;

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
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup. */}
            <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
            <span className={styles.portalTag}>HomeKrafter</span>
          </Link>
          <div className={styles.topbarActions}>
            <span className={styles.sellerName}>
              {seller?.displayName ?? user?.name ?? "HomeKrafter"}
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
        <nav className={clsx(styles.sidebar, "hk-scroll")} aria-label="HomeKrafter">
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
