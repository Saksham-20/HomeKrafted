"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, ShieldCheck, Store, User, Wallet, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { NavLink } from "@/lib/data";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { SearchForm } from "@/components/search/SearchForm";
import { FOCUSABLE, trapTab } from "@/lib/focus-trap";
import styles from "./MobileDrawer.module.css";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  navItems: NavLink[];
  /** The non-catalogue ways in (M34). The desktop row dropped these to make the search field typable; the drawer keeps them, or the footer becomes the only route to /corporate and /meal-plans on a phone. */
  secondaryItems: NavLink[];
  /** Undefined while `useWallet()` is still hydrating (see `HeaderClient`) — renders "…" instead of a misleading ₹0. */
  walletBalance: number | undefined;
  /** Present only for a signed-in seller currently in shopping mode — `HeaderClient`'s `sellerModePill` hides below ~1190px (`.hideOnMobile`), so this is the only way to reach the dual-mode toggle on mobile (M8.5, same reasoning as the Wishlist entry below). */
  onSwitchToSelling?: () => void;
  /** The admin mirror of `onSwitchToSelling` — true only for a signed-in admin. A plain link to `/admin` rather than a callback, because admin has no persisted mode to flip; same mobile reasoning (the header pill hides below ~1190px). */
  showAdminSwitch?: boolean;
}

/**
 * Slide-in mobile nav. Carries the primary nav links plus wallet/wishlist/
 * account entries — the header hides its desktop nav, search pill and
 * wishlist/account icons below ~1190px, so this is the only way to reach
 * them on small screens.
 */
export function MobileDrawer({
  open,
  onClose,
  navItems,
  secondaryItems,
  walletBalance,
  onSwitchToSelling,
  showAdminSwitch,
}: MobileDrawerProps) {
  const { count: wishlistCount } = useWishlist();
  /* Only the secondary entries the primary group does not already
     carry — see the "More ways to order" block below. Compared on
     `href`, not on `label`, because the two lists deliberately word the
     same destination differently ("Meal plans" in the strip, the
     owner's "Subscription Plans" in the nav). */
  const primaryHrefs = new Set(navItems.map((item) => item.href));
  const extraItems = secondaryItems.filter((item) => !primaryHrefs.has(item.href));
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Focus management (M16). The drawer already trapped scroll and closed
   * on Escape, but focus stayed on the page behind it — so a keyboard or
   * screen-reader user opened a modal and then tabbed straight through
   * the content it was covering, which is `aria-modal="true"` telling
   * them something that isn't true.
   *
   * Three things, all of which a real dialog owes: move focus in on open,
   * keep Tab inside while it's there, and put focus back where it came
   * from on close. The last one matters most — landing back at the top of
   * the document after closing a menu is how a keyboard user loses their
   * place.
   */
  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Wrap at both ends — shared with `LocationPrompt` and `ReelViewer`,
      // see `lib/focus-trap.ts`.
      trapTab(panel, event);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Back to the hamburger that opened it, if it's still on the page.
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={clsx(styles.scrim, open && styles.open)}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={clsx(styles.panel, open && styles.open)}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
      >
        <div className={styles.panelHeader}>
          <span className={styles.eyebrow}>Menu</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* The header's search pill is one of the things `.hideOnMobile`
            hides below ~1190px, so without this the drawer's whole width
            range has no way to search at all. */}
        <div className={styles.searchWrap}>
          <SearchForm variant="block" placeholder="Search homemade…" onSubmitted={onClose} />
        </div>

        <nav className={styles.navList} aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={styles.navItem}
              onClick={onClose}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* The second group (M34). Set quieter than the catalogue links
            above and labelled, because these are flows rather than
            things to browse — but they are in the same panel at the same
            tap size, which is the point: the desktop row lost them, the
            phone did not.

            Deduplicated against the group above since 2026-09-05, when
            the desktop nav grew to six and took Meal plans and Corporate
            & bulk back. On the home page a tab and a quick-entry tile
            saying the same thing are two different offers — the tile
            explains, the tab shortcuts. In one vertical list they are
            just the same link printed twice, which reads as a bug. The
            group disappears entirely if nothing is left in it. */}
        {extraItems.length > 0 && (
          <nav className={styles.secondaryList} aria-label="More ways to order">
            <span className={styles.secondaryHeading}>More ways to order</span>
            {extraItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={styles.secondaryItem}
                onClick={onClose}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className={styles.divider} />

        <div className={styles.utilList}>
          {onSwitchToSelling && (
            <button
              type="button"
              className={styles.utilItem}
              onClick={() => {
                onClose();
                onSwitchToSelling();
              }}
            >
              <span className={styles.utilIcon}>
                <Store size={19} strokeWidth={1.7} />
              </span>
              <span className={styles.utilLabel}>Switch to selling</span>
            </button>
          )}
          {showAdminSwitch && (
            <Link href="/admin" className={styles.utilItem} onClick={onClose}>
              <span className={styles.utilIcon}>
                <ShieldCheck size={19} strokeWidth={1.7} />
              </span>
              <span className={styles.utilLabel}>Switch to admin panel</span>
            </Link>
          )}
          <Link href="/wallet" className={styles.utilItem} onClick={onClose}>
            <span className={styles.utilIcon}>
              <Wallet size={19} strokeWidth={1.7} />
            </span>
            <span className={styles.utilLabel}>Wallet</span>
            <span className={styles.utilMeta}>
              {walletBalance === undefined ? "…" : formatCurrency(walletBalance)}
            </span>
          </Link>
          <Link href="/account/wishlist" className={styles.utilItem} onClick={onClose}>
            <span className={styles.utilIcon}>
              <Heart size={19} strokeWidth={1.7} />
            </span>
            <span className={styles.utilLabel}>Wishlist</span>
            {wishlistCount > 0 && <span className={styles.utilMeta}>{wishlistCount}</span>}
          </Link>
          <Link href="/account/profile" className={styles.utilItem} onClick={onClose}>
            <span className={styles.utilIcon}>
              <User size={19} strokeWidth={1.7} />
            </span>
            <span className={styles.utilLabel}>Account</span>
          </Link>
        </div>
      </div>
    </>
  );
}
