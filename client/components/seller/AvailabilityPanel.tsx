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
import type { ProductModerationStatus } from "@/lib/types";
import {
  resolveCanonicalListingState,
  getCanonicalStateBadge,
} from "@/lib/sell/canonical-listing";
import styles from "./AvailabilityPanel.module.css";

interface Row {
  id: string;
  name: string;
  price: number;
  available: boolean;
  kind: "listing" | "menu";
  moderationStatus?: ProductModerationStatus;
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
  // A failed source is not an empty source (M37): swallowing both into
  // `[]` told a kitchen with forty listings "You haven't added anything
  // yet" the moment the API hiccuped — over the panel that decides what
  // they sell today.
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      try {
        const FAILED = "__failed__" as const;
        const [listings, menu] = await Promise.all([
          getSellerListings(seller.vendorId).catch(() => FAILED),
          getSellerMenu(seller.id).catch(() => FAILED),
        ]);
        if (cancelled) return;
        const failures: string[] = [];
        if (listings === FAILED) failures.push("storefront listings");
        if (menu === FAILED) failures.push("WhatsApp menu");
        setFailedSources(failures);
        setRows([
          ...(listings === FAILED ? [] : listings).map((p) => ({
            id: p.id,
            name: p.name,
            price: p.weightOptions.find((w) => w.sku === p.defaultWeightSku)?.price ?? 0,
            available: p.isAvailable !== false,
            kind: "listing" as const,
            moderationStatus: p.moderationStatus,
          })),
          ...(menu === FAILED ? [] : menu).map((snack) => ({
            id: snack.id,
            name: snack.name,
            price: snack.price,
            available: snack.available,
            kind: "menu" as const,
            moderationStatus: snack.moderationStatus,
          })),
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, reloadToken]);

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

  const rowsWithState = rows.map((r) => {
    const canonicalState = resolveCanonicalListingState({
      moderationStatus: r.moderationStatus,
      isAvailable: r.available,
      stock: 1, // Defaulting to 1 for menu/listing availability panel presence
    });
    const badge = getCanonicalStateBadge(canonicalState);
    return { ...r, canonicalState, badge };
  });

  const liveCount = rowsWithState.filter((r) => r.canonicalState === "live").length;
  const pendingCount = rowsWithState.filter((r) => r.canonicalState === "submitted").length;
  const changesCount = rowsWithState.filter((r) => r.canonicalState === "changes_requested").length;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Today&rsquo;s menu</h2>
          <p className={styles.sub}>
            {rows.length === 0
              ? failedSources.length > 0
                ? "Some of your items couldn't be loaded."
                : "You haven't added anything yet."
              : `${liveCount} of ${rows.length} items are on sale right now${
                  pendingCount > 0
                    ? ` (${pendingCount} awaiting approval)`
                    : ""
                }${changesCount > 0 ? ` (${changesCount} need fixes)` : ""}.`}
          </p>
        </div>
        <Link href="/seller/listings/new" className={styles.addLink}>
          + Add an item
        </Link>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {failedSources.length > 0 && (
        <p className={styles.error} role="alert">
          We couldn&rsquo;t load your {failedSources.join(" or ")} just now — those items exist,
          they just aren&rsquo;t showing here.{" "}
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => {
              setLoading(true);
              setReloadToken((n) => n + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}

      {rows.length === 0 ? (
        failedSources.length > 0 ? null : (
          <p className={styles.empty}>
            Add your first dish or jar from <Link href="/seller/listings/new">Listings</Link>, or
            put today&rsquo;s specials on your <Link href="/seller/menu/new">WhatsApp menu</Link>.
          </p>
        )
      ) : (
        <ul className={styles.list}>
          {rowsWithState.map((row) => {
            const canToggle = row.canonicalState === "live" || row.canonicalState === "paused";
            return (
              <li key={`${row.kind}-${row.id}`} className={styles.row}>
                <span className={styles.name}>
                  {row.name}
                  <span className={styles.kind}>{row.kind === "menu" ? "Menu" : "Storefront"}</span>
                  {row.canonicalState !== "live" && row.canonicalState !== "paused" && (
                    <span
                      className={styles.kind}
                      title={row.badge.description}
                      style={{
                        background:
                          row.badge.variant === "warning"
                            ? "var(--hk-amber-light, #fef3c7)"
                            : row.badge.variant === "error"
                              ? "var(--hk-rose-light, #ffe4e6)"
                              : "var(--hk-surface-subtle, #f1f5f9)",
                        color:
                          row.badge.variant === "warning"
                            ? "var(--hk-amber-dark, #92400e)"
                            : row.badge.variant === "error"
                              ? "var(--hk-rose-dark, #be123c)"
                              : "var(--hk-text-subtle, #64748b)",
                      }}
                    >
                      {row.badge.label}
                    </span>
                  )}
                </span>
                <span className={styles.price}>{formatCurrency(row.price)}</span>
                <label className={styles.toggle} title={!canToggle ? row.badge.description : undefined}>
                  <input
                    type="checkbox"
                    checked={row.canonicalState === "live"}
                    disabled={busyId === row.id || !canToggle}
                    onChange={() => toggle(row)}
                  />
                  <span className={styles.toggleLabel}>
                    {row.canonicalState === "live"
                      ? "On sale"
                      : row.canonicalState === "paused"
                        ? "Paused"
                        : "Hidden"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
