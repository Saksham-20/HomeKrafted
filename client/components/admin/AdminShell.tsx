"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Banknote,
  BarChart3,
  Building2,
  FolderOpen,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Package,
  ScrollText,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAdminDashboard, type AdminDashboardSnapshot } from "@/lib/api";
import type { AdminScope } from "@/lib/types";
import { useScrollActiveIntoView } from "@/lib/useScrollActiveIntoView";
import styles from "./AdminShell.module.css";

/**
 * The six questions an operator opens the panel to answer, in the order
 * they come up (2026-09-04). Fifteen flat rows in build order —
 * "Wallet" between "Catalog" and "Payouts", "Audit" under "Analytics" —
 * gave a new admin nothing to read a label against.
 */
type AdminNavGroup = "Overview" | "People" | "Orders & money" | "Catalogue" | "Inbox" | "System";

const NAV_GROUPS: AdminNavGroup[] = [
  "Overview",
  "People",
  "Orders & money",
  "Catalogue",
  "Inbox",
  "System",
];

/** Which queue count from `getAdminDashboard().attention` badges a nav item. */
type QueueKey = "applications" | "listings" | "support" | "payouts" | "corporate";

interface AdminNavItem {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
  group: AdminNavGroup;
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
  /** The waiting count shown beside the label, when this screen is a queue. */
  queue?: QueueKey;
}

const NAV: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutGrid, group: "Overview", scope: "analytics" },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, group: "Overview", scope: "analytics" },
  { label: "Users", href: "/admin/users", icon: Users, group: "People", scope: "users" },
  { label: "HomeKrafters", href: "/admin/sellers", icon: Store, group: "People", scope: "sellers", queue: "applications" },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag, group: "Orders & money", scope: "orders" },
  { label: "Despatch", href: "/admin/shipping", icon: Truck, group: "Orders & money", scope: "orders" },
  // M15 — until this existed, a HomeKrafter's payout request had nowhere
  // to go: `pending` was terminal in practice.
  { label: "Payouts", href: "/admin/payouts", icon: Banknote, group: "Orders & money", scope: "finance", queue: "payouts" },
  { label: "Wallet", href: "/admin/wallet", icon: Wallet, group: "Orders & money", scope: "finance" },
  { label: "Catalog", href: "/admin/catalog", icon: Package, group: "Catalogue", scope: "catalog", queue: "listings" },
  { label: "Collections", href: "/admin/collections", icon: FolderOpen, group: "Catalogue", scope: "catalog" },
  // M15 — customers had been filing tickets since M7b with nothing on the
  // platform able to read them.
  { label: "Support", href: "/admin/support", icon: LifeBuoy, group: "Inbox", scope: "support", queue: "support" },
  // M20. Until then `CorporateInquiry` had a live public form writing
  // rows that nothing anywhere read.
  { label: "Corporate", href: "/admin/corporate", icon: Building2, group: "Inbox", scope: "orders", queue: "corporate" },
  // M27. The rows have been written since M8 and read by nobody — the
  // endpoint existed with no screen in front of it, while the production
  // audit listed an audit log as a feature of this panel.
  { label: "Audit", href: "/admin/audit", icon: ScrollText, group: "System", scope: "users" },
  // M16 (M5). Last on purpose — a platform-wide value changes rarely and
  // is the one thing here that affects every other surface.
  { label: "Settings", href: "/admin/settings", icon: SlidersHorizontal, group: "System", scope: "settings" },
];

/** How long a fetched set of queue counts is trusted before a focus refreshes it. */
const QUEUE_STALE_MS = 60_000;

function queueCounts(snapshot: AdminDashboardSnapshot | undefined): Record<QueueKey, number> {
  const a = snapshot?.attention;
  return {
    applications: a?.pendingApplications ?? 0,
    // Flagged listings need looking at as much as new ones do, and both
    // clear from the same screen.
    listings: (a?.pendingListings ?? 0) + (a?.flaggedListings ?? 0),
    support: a?.supportWaiting ?? 0,
    payouts: a?.payoutRequests ?? 0,
    corporate: a?.corporateNew ?? 0,
  };
}

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
 * `RoleShell` so the two role surfaces can diverge freely without
 * either one's changes risking a regression in the other.
 *
 * **Queue badges (2026-09-04).** The five screens that are queues carry
 * their waiting count in the nav, read from the same
 * `GET /admin/dashboard` the front page uses — so "is anything waiting
 * on me" is answered from any screen, not only the dashboard. Fetched
 * once on mount and again when the window regains focus after a minute;
 * never on every navigation. A sub-admin without `analytics` cannot read
 * it and simply gets no badges — the counts are a courtesy, the queues
 * themselves say what is in them.
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
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | undefined>(undefined);
  const [fetchedAt, setFetchedAt] = useState(0);

  /**
   * M47. `undefined` means an account that predates the field on a client
   * that has not reloaded — treated as "everything", because the
   * alternative is an operator staring at an empty sidebar during a
   * deploy. The server is the gate either way, so the worst case here is
   * a link that 403s with a sentence saying which section to ask for.
   */
  const scopes = user?.adminScopes;
  const nav = scopes ? NAV.filter((item) => scopes.includes(item.scope)) : NAV;
  const canReadQueues = !scopes || scopes.includes("analytics");

  useEffect(() => {
    if (!ready || !isSignedIn || role !== "admin" || !canReadQueues) return;
    let cancelled = false;
    const load = () => {
      getAdminDashboard()
        .then((next) => {
          if (cancelled) return;
          setSnapshot(next);
          setFetchedAt(Date.now());
        })
        .catch(() => {
          // A missing badge is not an error state worth a banner: the
          // queues still say what they hold when opened.
        });
    };
    load();
    const onFocus = () => {
      if (Date.now() - fetchedAt > QUEUE_STALE_MS) load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
    // `fetchedAt` is read inside the focus handler on purpose and must
    // not re-run the effect — that would refetch on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSignedIn, role, canReadQueues]);

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
          <p className={styles.gateCopy}>You need an admin account to view this page.</p>
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
    scopes && currentSection && !scopes.includes(currentSection.scope) ? currentSection : undefined;

  const counts = queueCounts(snapshot);

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
            <Button variant="secondary" size="sm" onClick={handleSignOut} className={styles.signOutButton}>
              <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className={clsx("container", styles.body)}>
        <nav ref={navRef} className={clsx(styles.sidebar, "hk-scroll", "hk-strip-fade")} aria-label="Admin">
          {NAV_GROUPS.map((group) => {
            const items = nav.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className={styles.navGroup}>
                {/* A heading, not a separator: on the mobile strip the rows
                    run horizontally and a bare rule between them says
                    nothing about what changed. `aria-hidden` — the group is
                    announced through the nav's own structure below. */}
                <span className={styles.navGroupLabel} aria-hidden="true">
                  {group}
                </span>
                {items.map((item) => {
                  const active =
                    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  const waiting = item.queue ? counts[item.queue] : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(styles.navItem, active && styles.navItemActive)}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                      <span>{item.label}</span>
                      {waiting > 0 && (
                        <span className={styles.navBadge}>
                          {waiting}
                          <span className="hk-sr-only"> waiting</span>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className={styles.content}>
          {blockedSection ? (
            <div className={styles.blockedCard}>
              <h1 className={styles.blockedTitle}>
                {blockedSection.label} isn&rsquo;t part of your admin account
              </h1>
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
