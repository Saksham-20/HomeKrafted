"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card } from "@/components/ui/Card";
import {
  getSellerListings,
  getSellerMenu,
  setListingAvailability,
  setMenuItemAvailability,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import styles from "./AvailabilityPanel.module.css";

interface Row {
  id: string;
  name: string;
  price: number;
  available: boolean;
  kind: "listing" | "menu";
}

/**
 * "What am I making today" — the switchboard a home cook opens most.
 *
 * Lists everything this HomeKrafter sells, from both sources they can add
 * to (storefront listings and the WhatsApp menu), each with one toggle.
 * Switching an item off pulls it from search, the storefront and the menu
 * immediately; it does not delete anything, so tomorrow it's one tap back.
 *
 * Optimistic: the toggle flips straight away and reverts if the request
 * fails. A cook standing in a kitchen shouldn't wait on a round-trip to see
 * whether the thing they just sold out of is off the site.
 */
export function AvailabilityPanel() {
  const { ready, seller } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      try {
        // Either source can legitimately be empty (or forbidden on an older
        // account), so failures collapse to "nothing from that source"
        // rather than emptying the whole panel.
        const [listings, menu] = await Promise.all([
          getSellerListings(seller.vendorId).catch(() => []),
          getSellerMenu(seller.id).catch(() => []),
        ]);
        if (cancelled) return;
        setRows([
          ...listings.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.weightOptions.find((w) => w.sku === p.defaultWeightSku)?.price ?? 0,
            available: p.isAvailable !== false,
            kind: "listing" as const,
          })),
          ...menu.map((snack) => ({
            id: snack.id,
            name: snack.name,
            price: snack.price,
            available: snack.available,
            kind: "menu" as const,
          })),
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  async function toggle(row: Row) {
    if (!seller) return;
    const next = !row.available;
    setBusyId(row.id);
    setError(null);
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, available: next } : r)));
    try {
      if (row.kind === "listing") {
        await setListingAvailability(seller.vendorId, row.id, next);
      } else {
        await setMenuItemAvailability(seller.id, row.id, next);
      }
    } catch {
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, available: !next } : r)));
      setError("Couldn't update that item. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || loading) {
    return <Card className={styles.card}>Loading your items…</Card>;
  }

  const liveCount = rows.filter((r) => r.available).length;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Today&rsquo;s menu</h2>
          <p className={styles.sub}>
            {rows.length === 0
              ? "You haven't added anything yet."
              : `${liveCount} of ${rows.length} items are on sale right now.`}
          </p>
        </div>
        <Link href="/seller/listings/new" className={styles.addLink}>
          + Add an item
        </Link>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Add your first dish or jar from <Link href="/seller/listings/new">Listings</Link>, or put
          today&rsquo;s specials on your <Link href="/seller/menu/new">WhatsApp menu</Link>.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`} className={styles.row}>
              <span className={styles.name}>
                {row.name}
                <span className={styles.kind}>{row.kind === "menu" ? "Menu" : "Storefront"}</span>
              </span>
              <span className={styles.price}>{formatCurrency(row.price)}</span>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={row.available}
                  disabled={busyId === row.id}
                  onChange={() => toggle(row)}
                />
                <span className={styles.toggleLabel}>{row.available ? "On sale" : "Paused"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
