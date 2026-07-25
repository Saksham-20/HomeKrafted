"use client";

import { useEffect } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, User, Wallet, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { NavLink } from "@/lib/data";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import styles from "./MobileDrawer.module.css";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  navItems: NavLink[];
  /** Undefined while `useWallet()` is still hydrating (see `HeaderClient`) — renders "…" instead of a misleading ₹0. */
  walletBalance: number | undefined;
}

/**
 * Slide-in mobile nav. Carries the primary nav links plus wallet/wishlist/
 * account entries — the header hides its desktop nav, search pill and
 * wishlist/account icons below ~840px, so this is the only way to reach
 * them on small screens.
 */
export function MobileDrawer({ open, onClose, navItems, walletBalance }: MobileDrawerProps) {
  const { count: wishlistCount } = useWishlist();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
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
