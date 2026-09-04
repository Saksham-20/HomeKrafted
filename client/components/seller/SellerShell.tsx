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
import { useScrollActiveIntoView } from "@/lib/useScrollActiveIntoView";
import styles from "./SellerShell.module.css";

interface SellerNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
  /**
   * Which group heading this sits under (2026-09-04). The nav was ten
   * flat rows in the order the modules happened to be built, so
   * "Storefront" sat next to "Profile" with nothing saying which one held
   * a kitchen's story, and "Menu" — the snack menu that is ordered on
   * WhatsApp, not the product catalogue — sat next to "Listings" reading
   * like a synonym for it. Grouping is what lets a label be short and
   * still be unambiguous.
   */
  group: SellerNavGroup;
}

/**
 * The four questions a HomeKrafter opens the portal to answer, in the
 * order they matter: how am I doing, what am I selling, what does my shop
 * look like, what have I been paid.
 */
type SellerNavGroup = "Overview" | "What you sell" | "Your shop" | "Money";

const NAV_GROUPS: SellerNavGroup[] = ["Overview", "What you sell", "Your shop", "Money"];

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
  { label: "Today", href: "/seller", icon: LayoutGrid, group: "Overview" },
  // M16 (H6). Sits right after the dashboard: the dashboard answers
  // "what is happening today", this answers "what is selling, and when".
  { label: "Sales & trends", href: "/seller/analytics", icon: BarChart3, group: "Overview" },
  // "Products", not "Listings": a listing is our word for the row, and
  // the thing a home cook has is a product. `/seller/listings` keeps its
  // URL — it is bookmarked, and a rename is not worth a redirect.
  { label: "Products", href: "/seller/listings", icon: Package, group: "What you sell" },
  // The snack menu is ordered over WhatsApp, never checked out on the
  // site (`lib/channel.ts`), and beside "Products" the bare word "Menu"
  // read as a second name for the same screen.
  { label: "Snacks menu", href: "/seller/menu", icon: UtensilsCrossed, group: "What you sell" },
  // M20. Sits with the other catalogue screens rather than under Orders:
  // a plan is something a kitchen offers, and the meals it owes hang off
  // it. Every HomeKrafter gets it, like every other module here — a plan
  // is no longer tied to being a meal, so "do you cook?" is not a
  // question this nav needs to answer.
  { label: "Meal plans", href: "/seller/meal-plans", icon: CalendarClock, group: "What you sell" },
  { label: "Orders", href: "/seller/orders", icon: ShoppingBag, group: "Overview" },
  // Pickups removed in M19 with the rest of laundry. The ROUTE still
  // resolves on purpose: `POST /laundry/bookings` is now gone (410), so no
  // new bookings arrive, but anyone with one already in flight must still
  // be able to fulfil it. `SellerDashboardClient` shows a link to it when
  // they have outstanding pickups.
  // "Shop page", because that is what it edits — the name, photo, banner
  // and blurb a shopper sees at the top of the storefront.
  { label: "Shop page", href: "/seller/storefront", icon: Store, group: "Your shop" },
  // M16. Separate from the shop page on purpose: that one is the four
  // catalogue fields on every product card; this one is the story,
  // hours, policies and licence a buyer reads before trusting a kitchen —
  // so it is labelled by what it holds, not by the word "profile", which
  // most people read as their own account.
  { label: "About your kitchen", href: "/seller/profile", icon: UserRound, group: "Your shop" },
  { label: "Reviews", href: "/seller/reviews", icon: Star, group: "Your shop" },
  { label: "Earnings & payouts", href: "/seller/payouts", icon: Wallet, group: "Money" },
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
  // The portal nav is a horizontal strip on a phone; without this it
  // always starts at item one, so `aria-current` points off-screen.
  const navRef = useScrollActiveIntoView(pathname);
  const router = useRouter();
  const {
    ready,
    isSignedIn,
    role,
    user,
    seller,
    sellerResolving,
    sellerLoadFailed,
    retrySellerRecord,
    switchToShopping,
    switchToSelling,
    signOut,
  } = useAuth();

  // Keep the persisted `sellerMode` honest for anyone who lands on a
  // `/seller/*` page directly (bookmark, back/forward, a link elsewhere)
  // rather than via the shopping-side toggle — see `HeaderClient`'s
  // matching effect for the reverse direction.
  useEffect(() => {
    if (ready && isSignedIn && role === "seller") switchToSelling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSignedIn, role]);

  /*
   * Three states, not two.
   *
   * This used to gate on `!seller`, and `seller` arrives from
   * AuthContext's `GET /seller/me` — so for the whole of that round trip
   * a HomeKrafter who had just signed in correctly was shown **"Sign in
   * as a HomeKrafter"**, and then the dashboard. ~50ms locally, a full
   * RTT plus server time in production, and it is the first thing they
   * see after typing their password. It also reads as a rejection, which
   * is the one thing it definitely was not.
   *
   * `sellerResolving` separates "the answer has not arrived" from "the
   * answer was no". Only the second is a gate. The first renders the real
   * chrome and the children immediately — the children gate their own
   * fetches (`sellerDataReady`), so they are safe to mount early, and in
   * real mode they can start fetching before `/seller/me` even lands.
   */
  /*
   * Four states now, not three (M39).
   *
   * `sellerResolving` split "hasn't answered" from "answered no". What it
   * could not express is **"could not ask"** — and that is the state a
   * real HomeKrafter was in. `/seller/me` 403s for the whole of an
   * admin-issued temporary password (M32), `getMySeller` swallowed it,
   * and the shell read the resulting `undefined` as an answered no. So
   * the person who had just typed the right password was told to sign in
   * as a HomeKrafter, and the button under it returned them to the login
   * screen that had just sent them here.
   *
   * A failure gets a retry, never a rejection. The rejection is reserved
   * for a question that was actually answered.
   */
  if (ready && sellerLoadFailed) {
    return (
      <section className={clsx("container", styles.gatePage)}>
        <div className={styles.gateCard}>
          <span className={styles.eyebrow}>HomeKrafter portal</span>
          <h1 className={styles.gateTitle}>We couldn&rsquo;t load your kitchen</h1>
          <p className={styles.gateCopy}>
            Your account is fine &mdash; we just couldn&rsquo;t reach your kitchen&rsquo;s record
            just now. Try again in a moment.
          </p>
          <Button variant="primary" onClick={retrySellerRecord}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  if (ready && !sellerResolving && (!isSignedIn || role !== "seller" || !seller)) {
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
            {/* A skeleton, not `user?.name`, while the kitchen is still
                resolving. The account holder's name is available and
                *correct*, but it is a different string from the display
                name that replaces it a moment later ("Anjali" →
                "Anjali's Kitchen"), so using it swaps one real name for
                another in the topbar and reads as a glitch. Never another
                kitchen's name, and never "undefined" — M17. */}
            {sellerResolving ? (
              <span className={styles.sellerNameSkeleton} aria-hidden="true" />
            ) : (
              <span className={styles.sellerName}>
                {seller?.displayName ?? user?.name ?? "HomeKrafter"}
              </span>
            )}
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
        {/* The mobile strip's edge fades (see the stylesheet) are the
            affordance that there is more nav than fits. Auto-scrolling the
            active item into view was attempted and removed — see
            `TODOS.md`; the scroll position is reset after the effect runs. */}
        <nav ref={navRef} className={clsx(styles.sidebar, "hk-scroll", "hk-strip-fade")} aria-label="HomeKrafter">
          {NAV_GROUPS.map((group) => (
            <div key={group} className={styles.navGroup}>
              {/* A heading, not a separator: on the mobile strip the rows
                  run horizontally and a bare rule between them says
                  nothing about what changed. `aria-hidden` — the group is
                  announced through the nav's own structure below. */}
              <span className={styles.navGroupLabel} aria-hidden="true">
                {group}
              </span>
              {navItems
                .filter((item) => item.group === group)
                .map((item) => {
            const active =
              item.href === "/seller" ? pathname === "/seller" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                // `prefetch={false}` (M31), and it is worth the paragraph.
                //
                // The sidebar is fully on screen the instant the portal
                // mounts, so Next prefetched **every** entry at once — and
                // in the App Router each one is several segment requests
                // (`/_tree`, `/_head`, `__PAGE__`, …) plus its route
                // chunks. Measured on the login transition: about seventy
                // five requests and fifteen scripts landing between the
                // navigation and the dashboard's own `GET
                // /seller/dashboard`, which did not get issued until
                // ~370ms — roughly 300ms of it queued behind prefetches
                // for pages nobody had asked for. This is the "~265ms of
                // undiagnosed idle" M30 recorded and could not explain.
                //
                // The portal is a tool used deliberately by one signed-in
                // person, not a browse surface: paying that on every
                // single sign-in to save a few tens of milliseconds on a
                // click that may never come is the wrong way round. Hover
                // still prefetches, which covers the real click.
                prefetch={false}
                className={clsx(styles.navItem, active && styles.navItemActive)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{item.label}</span>
              </Link>
            );
                })}
            </div>
          ))}
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
