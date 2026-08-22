"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Banknote, BarChart3, Building2, FolderOpen, LayoutGrid, LifeBuoy, LogOut, Package, ScrollText, ShoppingBag, SlidersHorizontal, Store, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import type { AdminScope } from "@/lib/types";
import { useScrollActiveIntoView } from "@/lib/useScrollActiveIntoView";
import styles from "./AdminShell.module.css";

interface AdminNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
  /**
   * Which section this belongs to (M47). A sub-admin who does not hold it
   * does not see the link.
   *
   * **Hiding a link is a courtesy, not a gate.** `AdminScopeGuard`
   * refuses the route regardless, and reads the database row rather than
   * the token so a revoked scope bites immediately. If this map ever
   * disagrees with the server, the cost is a visible link that 403s with
   * a sentence — never access.
   */
  scope: AdminScope;
  /** M11a left these 4 as visible-but-inert "Soon" slots; M11b built the routes and flipped them live below. Kept on the type in case a future module needs the same staged-rollout treatment. */
  disabled?: boolean;
}

const NAV: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutGrid, scope: "analytics" },
  { label: "Users", href: "/admin/users", icon: Users, scope: "users" },
  { label: "HomeKrafters", href: "/admin/sellers", icon: Store, scope: "sellers" },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag, scope: "orders" },
  { label: "Catalog", href: "/admin/catalog", icon: Package, scope: "catalog" },
  { label: "Wallet", href: "/admin/wallet", icon: Wallet, scope: "finance" },
  // M15 — until this existed, a HomeKrafter's payout request had nowhere
  // to go: `pending` was terminal in practice.
  { label: "Payouts", href: "/admin/payouts", icon: Banknote, scope: "finance" },
  // M15 — customers had been filing tickets since M7b with nothing on the
  // platform able to read them.
  { label: "Support", href: "/admin/support", icon: LifeBuoy, scope: "support" },
  // M20. Sits after Support because both are queues of people waiting on
  // a reply. Until now `CorporateInquiry` had a live public form writing
  // rows that nothing anywhere read.
  { label: "Corporate", href: "/admin/corporate", icon: Building2, scope: "orders" },
  { label: "Collections", href: "/admin/collections", icon: FolderOpen, scope: "catalog" },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, scope: "analytics" },
  // M27. The rows have been written since M8 and read by nobody — the
  // endpoint existed with no screen in front of it, while the production
  // audit listed an audit log as a feature of this panel.
  { label: "Audit", href: "/admin/audit", icon: ScrollText, scope: "users" },
  // M16 (M5). Last on purpose — a platform-wide value changes rarely and
  // is the one thing here that affects every other surface.
  { label: "Settings", href: "/admin/settings", icon: SlidersHorizontal, scope: "settings" },
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
  // The portal nav is a horizontal strip on a phone; without this it
  // always starts at item one, so `aria-current` points off-screen.
  const navRef = useScrollActiveIntoView(pathname);
  const router = useRouter();
  const { ready, isSignedIn, role, user, signOut } = useAuth();

  /**
   * M47. `undefined` means an account that predates the field on a client
   * that has not reloaded — treated as "everything", because the
   * alternative is an operator staring at an empty sidebar during a
   * deploy. The server is the gate either way, so the worst case here is
   * a link that 403s with a sentence saying which section to ask for.
   */
  const scopes = user?.adminScopes;
  const nav = scopes ? NAV.filter((item) => scopes.includes(item.scope)) : NAV;

  /**
   * A sub-admin without `analytics` has no dashboard to land on, and
   * `/admin/login` sends everybody to `/admin` (M47). Left alone they
   * arrive at a page whose every request 403s — technically correct and
   * indistinguishable from a broken panel. Send them to the first section
   * they *do* hold instead.
   *
   * `replace`, not `push`: the landing page they cannot use should not be
   * the thing Back returns them to.
   */
  useEffect(() => {
    if (!ready || !scopes) return;
    if (pathname !== "/admin") return;
    if (scopes.includes("analytics")) return;
    const first = nav[0];
    if (first) router.replace(first.href);
  }, [ready, scopes, pathname, nav, router]);


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

  /**
   * A sub-admin who follows a link, a bookmark or a browser autocomplete
   * into a section they do not cover (M47).
   *
   * Hiding the nav item is not enough on its own: the page would render,
   * every request on it would 403, and the screen would look broken
   * rather than restricted. This says which section it is and who to ask
   * — the same sentence the server's refusal carries, on the screen where
   * somebody is standing.
   *
   * Longest-prefix match, so `/admin/collections/occasions` resolves to
   * Collections rather than to Dashboard's `/admin`.
   */
  const currentSection = [...NAV]
    .filter((item) => item.href !== "/admin" && pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const blockedSection =
    scopes && currentSection && !scopes.includes(currentSection.scope)
      ? currentSection
      : undefined;

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
        <nav ref={navRef} className={clsx(styles.sidebar, "hk-scroll", "hk-strip-fade")} aria-label="Admin">
          {nav.map((item) => {
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
        <div className={styles.content}>
          {blockedSection ? (
            <div className={styles.blockedCard}>
              <h1 className={styles.blockedTitle}>{blockedSection.label} isn&rsquo;t part of your admin account</h1>
              <p className={styles.blockedCopy}>
                Your account covers{" "}
                {scopes && scopes.length > 0 ? scopes.join(", ") : "no sections"}. Ask an admin
                with the <strong>users</strong> section to add{" "}
                <strong>{blockedSection.scope}</strong> if you need this one.
              </p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
