"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bell,
  CalendarClock,
  Gift,
  Heart,
  LayoutGrid,
  MapPin,
  Package,
  Star,
  Store,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./AccountShell.module.css";

export interface AccountNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
}

/**
 * Account section nav (M7a: Overview/Orders/Addresses/Wishlist/Profile;
 * M7b appends Referrals/Notifications below, per the M7a brief's "leave
 * room for Referrals/Notifications from M7b" — same array, shell layout
 * logic untouched).
 */
export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { label: "Overview", href: "/account", icon: LayoutGrid },
  { label: "Orders", href: "/account/orders", icon: Package },
  // M20 — a meal plan is a standing commitment, not an order, and it is
  // the only thing here somebody manages rather than just reads.
  { label: "Meal plans", href: "/account/subscriptions", icon: CalendarClock },
  { label: "Addresses", href: "/account/addresses", icon: MapPin },
  { label: "Wishlist", href: "/account/wishlist", icon: Heart },
  // M15 — the buyer's half of the review loop: what's waiting to be
  // rated, and what they've already written.
  { label: "Reviews", href: "/account/reviews", icon: Star },
  // M15 — following persists now (`VendorFollow`), so there's something
  // to list. Before, the storefront's Follow button was local state.
  { label: "Following", href: "/account/following", icon: Store },
  { label: "Referrals", href: "/account/referrals", icon: Gift },
  { label: "Notifications", href: "/account/notifications", icon: Bell },
  { label: "Profile", href: "/account/profile", icon: User },
];

/**
 * Account shell (M7a) — the sidebar/section-nav wrapper every
 * `/account/*` route renders inside (`app/account/layout.tsx`). One `<nav>`
 * whose CSS flips from a sticky left sidebar (desktop) to a horizontal
 * scrollable tab strip (mobile, `.hk-scroll`) at ~780px — same "layout
 * transform via CSS, not conditional JS rendering" technique
 * `Header.module.css` uses for its own desktop/mobile split, so there's
 * no hydration-mismatch risk.
 *
 * Gates on `useAuth()`: while `!ready` (pre-hydration) or once signed in,
 * renders the shell normally (the default `isSignedIn` state is `true` on
 * both server and client, per `AuthContext`'s comment, so there's no
 * flash for the common case). Only after an explicit `signOut()` (Profile
 * page) does this swap to a "you're signed out" prompt instead of a
 * broken/empty account tree.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSignedIn, ready } = useAuth();

  if (ready && !isSignedIn) {
    return (
      <section className={clsx("container", styles.signedOutPage)}>
        <div className={styles.signedOutCard}>
          <span className={styles.eyebrow}>Account</span>
          <h1 className={styles.signedOutTitle}>You&rsquo;re signed out</h1>
          <p className={styles.signedOutCopy}>
            Sign in to view your orders, addresses, wishlist and wallet.
          </p>
          <Button variant="primary" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={clsx("container", styles.page)}>
      <nav className={clsx(styles.sidebar, "hk-scroll")} aria-label="Account">
        {ACCOUNT_NAV_ITEMS.map((item) => {
          const active = item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href);
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
    </section>
  );
}
