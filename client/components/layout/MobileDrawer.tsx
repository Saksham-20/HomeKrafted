"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, Store, User, Wallet, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { NavLink } from "@/lib/data";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { SearchForm } from "@/components/search/SearchForm";
import styles from "./MobileDrawer.module.css";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  navItems: NavLink[];
  /** Undefined while `useWallet()` is still hydrating (see `HeaderClient`) — renders "…" instead of a misleading ₹0. */
  walletBalance: number | undefined;
  /** Present only for a signed-in seller currently in shopping mode — `HeaderClient`'s `sellerModePill` hides below ~840px (`.hideOnMobile`), so this is the only way to reach the dual-mode toggle on mobile (M8.5, same reasoning as the Wishlist entry below). */
  onSwitchToSelling?: () => void;
}

/**
 * Slide-in mobile nav. Carries the primary nav links plus wallet/wishlist/
 * account entries — the header hides its desktop nav, search pill and
 * wishlist/account icons below ~840px, so this is the only way to reach
 * them on small screens.
 */
/** Everything focusable inside the panel, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileDrawer({ open, onClose, navItems, walletBalance, onSwitchToSelling }: MobileDrawerProps) {
  const { count: wishlistCount } = useWishlist();
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
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Wrap at both ends. Without this, Tab walks out of the dialog and
      // into the page it is covering.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
            hides below ~840px, so without this the drawer's whole width
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
