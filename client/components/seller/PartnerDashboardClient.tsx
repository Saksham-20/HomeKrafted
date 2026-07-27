"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Truck, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "./StatCard";
import { PickupRow } from "./PickupRow";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getLaundryServices,
  getPartnerBookings,
  getPartnerDashboard,
  type PartnerDashboardSnapshot,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { LaundryBooking, LaundryService } from "@/lib/types";
import styles from "./PartnerDashboardClient.module.css";

const QUICK_LINKS = [
  { label: "Pickups", href: "/seller/pickups", icon: Truck },
  { label: "Payouts", href: "/seller/payouts", icon: Wallet },
];

/**
 * `/seller` Dashboard for `type: "laundry"` sellers (M10b) — today's
 * assigned pickups/deliveries, this week's earnings, pending payout,
 * rating, plus a recent-pickups preview. Same client-fetch shape as
 * `MakerDashboardClient` (owner-scoped mock auth, no server session
 * yet), rendered by `SellerDashboardClient`'s type router.
 */
export function PartnerDashboardClient() {
  const { ready, seller } = useAuth();
  const [snapshot, setSnapshot] = useState<PartnerDashboardSnapshot | undefined>(undefined);
  const [recentBookings, setRecentBookings] = useState<LaundryBooking[]>([]);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;

    (async () => {
      const [snap, bookings, serviceList] = await Promise.all([
        getPartnerDashboard(seller),
        getPartnerBookings(seller.id),
        getLaundryServices(),
      ]);
      if (cancelled) return;
      setSnapshot(snap);
      setRecentBookings(bookings.slice(0, 5));
      setServices(serviceList);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  if (!ready || loading || !snapshot || !seller) {
    return <div className={styles.loading}>Loading your dashboard…</div>;
  }

  function serviceLabel(booking: LaundryBooking): string {
    const first = booking.lines[0];
    if (!first) return "—";
    return services.find((s) => s.id === first.serviceId)?.name ?? "—";
  }

  return (
    <div>
      <SellerPageHeader
        title={`Hi, ${seller.displayName}`}
        subtitle="Here's today's pickup and delivery schedule."
      />

      <div className={styles.statGrid}>
        <StatCard label="Today's pickups" value={String(snapshot.todayPickupsCount)} />
        <StatCard label="Today's deliveries" value={String(snapshot.todayDeliveriesCount)} />
        <StatCard label="This week's earnings" value={formatCurrency(snapshot.weekEarnings)} />
        <StatCard
          label="Pending payout"
          value={formatCurrency(snapshot.pendingPayoutAmount)}
          hint="Next settlement"
        />
        <StatCard
          label="Rating"
          value={snapshot.rating > 0 ? snapshot.rating.toFixed(1) : "—"}
          hint={`${snapshot.reviewCount} reviews`}
        />
      </div>

      <div className={styles.quickLinks}>
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Card key={link.href} hoverable padding="none" className={styles.quickLinkCard}>
              <Link href={link.href} className={styles.quickLink}>
                <span className={styles.quickLinkIcon}>
                  <Icon size={17} strokeWidth={1.7} />
                </span>
                {link.label}
              </Link>
            </Card>
          );
        })}
      </div>

      <h2 className={styles.sectionTitle}>Recent pickups</h2>
      {recentBookings.length === 0 ? (
        <Card className={styles.emptyState}>No pickups assigned yet.</Card>
      ) : (
        <div className={styles.recentList}>
          {recentBookings.map((booking) => (
            <PickupRow
              key={booking.id}
              booking={booking}
              serviceLabel={serviceLabel(booking)}
              href={`/seller/pickups/${booking.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
