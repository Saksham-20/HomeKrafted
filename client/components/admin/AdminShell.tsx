"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Banknote, BarChart3, Building2, FolderOpen, LayoutGrid, LifeBuoy, LogOut, Package, ScrollText, ShoppingBag, SlidersHorizontal, Store, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./AdminShell.module.css";

interface AdminNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
  /** M11a left these 4 as visible-but-inert "Soon" slots; M11b built the routes and flipped them live below. Kept on the type in case a future module needs the same staged-rollout treatment. */
  disabled?: boolean;
}

const NAV: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutGrid },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "HomeKrafters", href: "/admin/sellers", icon: Store },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Catalog", href: "/admin/catalog", icon: Package },
  { label: "Wallet", href: "/admin/wallet", icon: Wallet },
  // M15 — until this existed, a HomeKrafter's payout request had nowhere
  // to go: `pending` was terminal in practice.
  { label: "Payouts", href: "/admin/payouts", icon: Banknote },
  // M15 — customers had been filing tickets since M7b with nothing on the
  // platform able to read them.
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  // M20. Sits after Support because both are queues of people waiting on
  // a reply. Until now `CorporateInquiry` had a live public form writing
  // rows that nothing anywhere read.
  { label: "Corporate", href: "/admin/corporate", icon: Building2 },
  { label: "Collections", href: "/admin/collections", icon: FolderOpen },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  // M27. The rows have been written since M8 and read by nobody — the
  // endpoint existed with no screen in front of it, while the production
  // audit listed an audit log as a feature of this panel.
  { label: "Audit", href: "/admin/audit", icon: ScrollText },
  // M16 (M5). Last on purpose — a platform-wide value changes rarely and
  // is the one thing here that affects every other surface.
  { label: "Settings", href: "/admin/settings", icon: SlidersHorizontal },
];

/**
 * Admin portal shell (M11a) — `app/admin/(dashboard)/layout.tsx` wraps
 * every shelled admin route in this. Its own chrome, deliberately not a
 * reskin of `components/seller/SellerShell.tsx`: same pine-deep
 * topbar-over-sidebar recipe and the same sub-780px sidebar→horizontal-
 * scroll-strip collapse (`ConsumerChrome` hides the consumer
 * Header/Footer here too, same `pathname.startsWith("/admin")` check
 * that already covers `/seller`), but its own nav set and no
 * `SellerType`-driven routing — admin is one role, unscoped, no variants
 * to switch on. Kept as a separate component rather than a shared
 * `RoleShell` so the two role surfaces can diverge freely (M11b's
 * Catalog/Wallet/Collections/Analytics additions are admin-only) without
 * either one's changes risking a regression in the other.
 *
 * Gates on `useAuth()` client-side as a defensive fallback —
 * `middleware.ts` is the primary gate (redirects a non-admin request to
 * `/admin/login` before this ever renders) — this only covers the brief
 * window before `ready` flips true post-hydration, or a role that
 * changed in another tab.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, isSignedIn, role, user, signOut } = useAuth();

  if (ready && (!isSignedIn || role !== "admin")) {
    return (
      <section className={clsx("container", styles.gatePage)}>
        <div className={styles.gateCard}>
          <span className={styles.eyebrow}>Admin panel</span>
          <h1 className={styles.gateTitle}>Sign in as staff</h1>
          <p className={styles.gateCopy}>
            You need an admin account to view this page.
          </p>
          <Button variant="primary" onClick={() => router.push("/admin/login")}>
            Go to admin sign-in
          </Button>
        </div>
      </section>
    );
  }

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={clsx("container", styles.topbarRow)}>
          <Link href="/admin" className={styles.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup. */}
            <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
            <span className={styles.portalTag}>Admin</span>
          </Link>
          <div className={styles.topbarActions}>
            <span className={styles.adminName}>{user?.name ?? "Staff"}</span>
            <Link href="/" className={styles.viewSiteLink}>
              View site
            </Link>
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
        <nav className={clsx(styles.sidebar, "hk-scroll")} aria-label="Admin">
          {NAV.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className={clsx(styles.navItem, styles.navItemDisabled)}
                  aria-disabled="true"
                  title="Coming in M11b"
                >
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  <span className={styles.soonTag}>Soon</span>
                </span>
              );
            }

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
