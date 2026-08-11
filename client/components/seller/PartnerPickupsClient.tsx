"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Chip } from "@/components/ui/Chip";
import { SellerPageHeader } from "./SellerPageHeader";
import { PickupRow } from "./PickupRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
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
  const { seller, sellerDataReady } = useAuth();
  const [bookings, setBookings] = useState<LaundryBooking[]>([]);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<LaundryBookingStatus | "all">("all");

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const [list, serviceList] = await Promise.all([
          getPartnerBookings(seller?.id ?? ""),
          getLaundryServices(),
        ]);
        if (cancelled) return;
        setBookings(list);
        setServices(serviceList);
      } catch (error) {
        if (cancelled) return;
        if (!isForbidden(error)) throw error;
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller]);

  const filtered = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );

  if (!sellerDataReady || loading) {
    return <div className={styles.loading}>Loading your pickups…</div>;
  }

  if (unavailable) {
    return <ModuleUnavailable module="Pickups" />;
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
        <EmptyState
          title="No pickups in this status."
          body="Pickups appear here once a booking is assigned to you. Try another tab to see the ones already in progress."
        />
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
