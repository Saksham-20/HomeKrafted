"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Package,
  ShoppingBag,
  Star,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerDashboard, type SellerDashboardSnapshot } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { SellerPageHeader } from "./SellerPageHeader";
import { StatCard } from "./StatCard";
import { AvailabilityPanel } from "./AvailabilityPanel";
import styles from "./SellerDashboardClient.module.css";

/**
 * `/seller` — one dashboard for every HomeKrafter.
 *
 * Replaced a three-way router over `seller.type` that rendered
 * `MakerDashboardClient` / `PartnerDashboardClient` / `SnackDashboardClient`.
 * There is one role now, so there is one dashboard: the server returns a
 * single snapshot covering storefront orders, pickups and snack orders, and
 * a HomeKrafter who doesn't do pickups simply sees zeroes there rather than
 * a different page.
 *
 * The Availability panel sits directly on the dashboard on purpose — "what
 * am I cooking today" is the first thing a home cook opens the portal to
 * change, and burying it a click deep would make the common case the slow
 * one.
 */
export function SellerDashboardClient() {
  const { seller, sellerDataReady } = useAuth();
  const [snapshot, setSnapshot] = useState<SellerDashboardSnapshot | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // `sellerDataReady`, not `!ready || !seller`. `GET /seller/dashboard`
  // is scoped by the JWT and ignores the record entirely (`lib/api/seller.ts`
  // — the real branch is a bare `http.get`), so waiting for `/seller/me`
  // put a whole round trip in front of a request that never used its
  // answer. This is the login destination, so that hop was measured on
  // every single HomeKrafter sign-in.
  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        // `seller` may still be in flight in real mode, where this
        // argument is ignored; `sellerDataReady` guarantees mock mode
        // cannot reach here without it.
        const snap = await getSellerDashboard(seller!);
        if (!cancelled) setSnapshot(snap);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller]);

  if (!sellerDataReady || loading || !seller) {
    return <div className={styles.loading}>Loading your dashboard…</div>;
  }

  // A failed load used to fall through to the render below, where every
  // `?? 0` turned "we could not reach the server" into "Today's orders 0,
  // Today's revenue ₹0, Pending payout ₹0" — indistinguishable from a
  // quiet morning. A home cook deciding whether to cook today is exactly
  // the person who must not be shown invented zeroes.
  if (failed) {
    return (
      <div>
        <SellerPageHeader
          title={`Hi, ${seller.displayName}`}
          subtitle="We couldn't load today's numbers."
        />
        <div className={styles.loadFailed} role="alert">
          <p>
            Something went wrong fetching your dashboard, so the figures below are missing
            rather than zero. Your orders and listings are unaffected.
          </p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const s = snapshot;

  return (
    <div>
      <SellerPageHeader
        title={`Hi, ${seller.displayName}`}
        subtitle="Here's how things are going today."
      />

      <div className={styles.stats}>
        <StatCard label="Today's orders" value={String(s?.todayOrdersCount ?? 0)} />
        <StatCard label="Today's revenue" value={formatCurrency(s?.todayRevenue ?? 0)} />
        <StatCard
          label="Live items"
          value={`${s?.activeListingsCount ?? 0}/${s?.listingsCount ?? 0}`}
          hint="Switched on right now"
        />
        <StatCard label="Pending payout" value={formatCurrency(s?.pendingPayoutAmount ?? 0)} />
      </div>

      {/* Only worth the space if this HomeKrafter actually does pickups or
          takes WhatsApp snack orders — zeroes across the board would be
          noise on a pure storefront account. */}
      {((s?.todayPickupsCount ?? 0) > 0 ||
        (s?.todayDeliveriesCount ?? 0) > 0 ||
        (s?.incomingOrdersCount ?? 0) > 0) && (
        <div className={styles.stats}>
          <StatCard label="Pickups today" value={String(s?.todayPickupsCount ?? 0)} />
          <StatCard label="Deliveries today" value={String(s?.todayDeliveriesCount ?? 0)} />
          <StatCard label="Incoming snack orders" value={String(s?.incomingOrdersCount ?? 0)} />
          <StatCard label="Rating" value={(s?.rating ?? 0).toFixed(1)} hint={`${s?.reviewCount ?? 0} reviews`} />
        </div>
      )}

      <AvailabilityPanel />

      <nav className={styles.quickLinks} aria-label="Portal shortcuts">
        <Link href="/seller/listings" className={styles.quickLink}>
          <Package size={16} strokeWidth={1.7} aria-hidden="true" /> Listings
        </Link>
        <Link href="/seller/menu" className={styles.quickLink}>
          <UtensilsCrossed size={16} strokeWidth={1.7} aria-hidden="true" /> Menu
        </Link>
        <Link href="/seller/meal-plans" className={styles.quickLink}>
          <CalendarClock size={16} strokeWidth={1.7} aria-hidden="true" /> Meal plans
        </Link>
        <Link href="/seller/orders" className={styles.quickLink}>
          <ShoppingBag size={16} strokeWidth={1.7} aria-hidden="true" /> Orders
        </Link>
        {/*
          M19: laundry is withdrawn, so Pickups is off the shared nav
          (`SellerShell`). This link survives, **conditionally**, because a
          HomeKrafter with bookings still in flight has to be able to
          finish them — and with the nav entry gone this is the only way
          they'd find the screen. No outstanding pickups, no link.
        */}
        {((s?.todayPickupsCount ?? 0) > 0 || (s?.todayDeliveriesCount ?? 0) > 0) && (
          <Link href="/seller/pickups" className={styles.quickLink}>
            <Truck size={16} strokeWidth={1.7} aria-hidden="true" /> Pickups
          </Link>
        )}
        <Link href="/seller/payouts" className={styles.quickLink}>
          <Wallet size={16} strokeWidth={1.7} aria-hidden="true" /> Payouts
        </Link>
        <Link href="/seller/reviews" className={styles.quickLink}>
          <Star size={16} strokeWidth={1.7} aria-hidden="true" /> Reviews
        </Link>
      </nav>
    </div>
  );
}
