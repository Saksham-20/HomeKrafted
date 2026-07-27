"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SellerPageHeader } from "./SellerPageHeader";
import { PickupRow } from "./PickupRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { getLaundryServices, getPartnerBookings } from "@/lib/api";
import type { LaundryBooking, LaundryBookingStatus, LaundryService } from "@/lib/types";
import styles from "./PartnerPickupsClient.module.css";

const FILTERS: { value: LaundryBookingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "picked-up", label: "Picked up" },
  { value: "in-progress", label: "In progress" },
  { value: "out-for-delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

/** `/seller/pickups` (M10b, laundry type) — `LaundryBooking`s assigned to this partner, filterable by status, newest first. Mirrors `SellerOrdersClient`'s shape for the maker `Order` list, one level down (`LaundryBooking`/`LaundryBookingStatus` instead of `Order`/`OrderStatus`). */
export function PartnerPickupsClient() {
  const { ready, seller } = useAuth();
  const [bookings, setBookings] = useState<LaundryBooking[]>([]);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LaundryBookingStatus | "all">("all");

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      const [list, serviceList] = await Promise.all([
        getPartnerBookings(seller.id),
        getLaundryServices(),
      ]);
      if (cancelled) return;
      setBookings(list);
      setServices(serviceList);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  const filtered = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );

  if (!ready || loading) {
    return <div className={styles.loading}>Loading your pickups…</div>;
  }

  function serviceLabel(booking: LaundryBooking): string {
    const first = booking.lines[0];
    if (!first) return "—";
    return services.find((s) => s.id === first.serviceId)?.name ?? "—";
  }

  return (
    <div>
      <SellerPageHeader
        title="Pickups"
        subtitle={`${bookings.length} booking${bookings.length === 1 ? "" : "s"} assigned to you`}
      />

      <div className={styles.filterRow} role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className={styles.empty}>No pickups in this status.</Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((booking) => (
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
