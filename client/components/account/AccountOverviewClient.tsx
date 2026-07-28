"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, MapPin, Package, User, Wallet as WalletIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getAddresses, getOrderHistory } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/wallet/WalletContext";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { formatCurrency } from "@/lib/format";
import styles from "./AccountOverviewClient.module.css";

/**
 * Account overview (M7a; M8.4a real) — greeting, a wallet-balance
 * snapshot (real client state via `useWallet()`, same as the header
 * chip), and a quick-link grid into the other four sections.
 * `getOrderHistory()`/`getAddresses()` are owner-scoped real reads now,
 * so their counts are fetched here on mount (same reasoning as
 * `OrdersListClient` pre-M8.4 — see `lib/auth/session.ts`'s file header)
 * instead of server-fetched props; wishlist count and wallet balance are
 * read live so they're always current without a re-fetch.
 */
export function AccountOverviewClient() {
  const { user } = useAuth();
  const { balance, ready: walletReady } = useWallet();
  const { count: wishlistCount } = useWishlist();
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [addressCount, setAddressCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getOrderHistory(), getAddresses()]).then(([orders, addresses]) => {
      if (cancelled) return;
      setOrderCount(orders.length);
      setAddressCount(addresses.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Hi, {firstName}</h1>
        <p className={styles.subtitle}>
          One place for your orders, addresses, wishlist and profile.
        </p>
      </div>

      <Card className={styles.walletCard}>
        <span className={styles.walletIcon} aria-hidden="true">
          <WalletIcon size={22} strokeWidth={1.6} />
        </span>
        <div className={styles.walletBody}>
          <span className={styles.walletLabel}>Wallet balance</span>
          <span className={styles.walletAmount}>
            {walletReady ? formatCurrency(balance) : "…"}
          </span>
        </div>
        <Link href="/wallet" className={styles.walletCta}>
          View wallet →
        </Link>
      </Card>

      <div className={styles.grid}>
        <Link href="/account/orders" className={styles.tile}>
          <Card hoverable padding="md" className={styles.tileCard}>
            <span className={styles.tileIcon} aria-hidden="true">
              <Package size={20} strokeWidth={1.6} />
            </span>
            <span className={styles.tileLabel}>Orders</span>
            <span className={styles.tileMeta}>
              {orderCount === null ? "…" : `${orderCount} placed`}
            </span>
          </Card>
        </Link>

        <Link href="/account/addresses" className={styles.tile}>
          <Card hoverable padding="md" className={styles.tileCard}>
            <span className={styles.tileIcon} aria-hidden="true">
              <MapPin size={20} strokeWidth={1.6} />
            </span>
            <span className={styles.tileLabel}>Addresses</span>
            <span className={styles.tileMeta}>
              {addressCount === null ? "…" : `${addressCount} saved`}
            </span>
          </Card>
        </Link>

        <Link href="/account/wishlist" className={styles.tile}>
          <Card hoverable padding="md" className={styles.tileCard}>
            <span className={styles.tileIcon} aria-hidden="true">
              <Heart size={20} strokeWidth={1.6} />
            </span>
            <span className={styles.tileLabel}>Wishlist</span>
            <span className={styles.tileMeta}>
              {wishlistCount} saved
            </span>
          </Card>
        </Link>

        <Link href="/account/profile" className={styles.tile}>
          <Card hoverable padding="md" className={clsx(styles.tileCard)}>
            <span className={styles.tileIcon} aria-hidden="true">
              <User size={20} strokeWidth={1.6} />
            </span>
            <span className={styles.tileLabel}>Profile</span>
            <span className={styles.tileMeta}>Edit details</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
