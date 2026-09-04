"use client";

import { useEffect, useRef, useState } from "react";
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
import { LoadingRows } from "@/components/portal/LoadingRows";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
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
  //
  // **`seller` is read through a ref and is deliberately not a
  // dependency (M31).** It was one until M31, and that quietly undid the
  // fix above: in real mode `sellerDataReady` is true immediately while
  // `seller` arrives with `/seller/me`, so the record landing changed
  // this effect's identity, the cleanup set `cancelled` on the request
  // already in flight, and its answer was thrown away in favour of an
  // identical second one issued afterwards. The dashboard was therefore
  // still painting a full `/seller/me` round trip late — the exact
  // serialization removed here — while also fetching it twice.
  const sellerRef = useRef(seller);
  useEffect(() => {
    sellerRef.current = seller;
  }, [seller]);

  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        // `seller` may still be in flight in real mode, where this
        // argument is ignored; `sellerDataReady` guarantees mock mode
        // cannot reach here without it.
        const snap = await getSellerDashboard(sellerRef.current!);
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
  }, [sellerDataReady]);

  if (!sellerDataReady || loading || !seller) {
    return (
      <div>
        <SellerPageHeader title="Today" />
        <LoadingRows rows={3} showLabel label={kitchenLoading("seller/dashboard", MAKER_LOADING)} />
      </div>
    );
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

      {/* Today's work, before today's numbers (M37): the two counts a
          cook opens the portal for in the morning, each linking to the
          screen that clears it. Rendered only when non-zero. */}
      {((s?.mealsTodayCount ?? 0) > 0 || (s?.ordersAwaitingCount ?? 0) > 0) && (
        <div className={styles.pendingStrip}>
          {(s?.mealsTodayCount ?? 0) > 0 && (
            <Link href="/seller/meal-plans/deliveries" className={styles.pendingLink}>
              <strong>{s?.mealsTodayCount}</strong> meal
              {s?.mealsTodayCount === 1 ? "" : "s"} to cook today
            </Link>
          )}
          {(s?.ordersAwaitingCount ?? 0) > 0 && (
            <Link href="/seller/orders" className={styles.pendingLink}>
              <strong>{s?.ordersAwaitingCount}</strong> order
              {s?.ordersAwaitingCount === 1 ? "" : "s"} waiting to be confirmed
            </Link>
          )}
        </div>
      )}

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

      {/* The kitchen's own stated ceiling, shown against today's load so
          "am I overbooked" is answerable at a glance (M37). Only when the
          profile actually states one. */}
      {(s?.capacityPerDay ?? 0) > 0 && (
        <p className={styles.capacityLine}>
          Today: {(s?.todayOrdersCount ?? 0) + (s?.mealsTodayCount ?? 0)} of your stated{" "}
          {s?.capacityPerDay} orders/day capacity.
        </p>
      )}

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
          <Package size={16} strokeWidth={1.7} aria-hidden="true" /> Products
        </Link>
        <Link href="/seller/menu" className={styles.quickLink}>
          <UtensilsCrossed size={16} strokeWidth={1.7} aria-hidden="true" /> Snacks menu
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
          <Wallet size={16} strokeWidth={1.7} aria-hidden="true" /> Earnings
        </Link>
        <Link href="/seller/reviews" className={styles.quickLink}>
          <Star size={16} strokeWidth={1.7} aria-hidden="true" /> Reviews
        </Link>
      </nav>
    </div>
  );
}
