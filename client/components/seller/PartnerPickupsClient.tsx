"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { SellerPageHeader } from "./SellerPageHeader";
import { PickupRow } from "./PickupRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getPartnerBookings } from "@/lib/api";
import type { LaundryBooking, LaundryBookingStatus } from "@/lib/types";
import styles from "./PartnerPickupsClient.module.css";
import { Notice } from "@/components/portal/Notice";
import { Button } from "@/components/ui/Button";

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
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
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
        const list = await getPartnerBookings(seller?.id ?? "");
        if (cancelled) return;
        setBookings(list);
      } catch (error) {
        if (cancelled) return;
        if (isForbidden(error)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty screen. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered the empty state over real data — the
        // M37 dashboard rule, applied to every list (2026-09-04).
        setLoadError(apiErrorMessage(error, "Couldn't load your pickups. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller, reloadToken]);

  const filtered = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );

  if (!sellerDataReady || loading) {
    return (
      <div>
        <SellerPageHeader title="Pickups" />
        <LoadingRows rows={5} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="Pickups" />
        <Notice
          tone="danger"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setReloadToken((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (unavailable) {
    return <ModuleUnavailable module="Pickups" />;
  }

  // Rides on the booking row itself since M37 (`LaundryLine.serviceName`).
  function serviceLabel(booking: LaundryBooking): string {
    return booking.lines[0]?.serviceName ?? "—";
  }

  return (
    <div>
      <SellerPageHeader
        title="Pickups"
        subtitle={`${bookings.length} booking${bookings.length === 1 ? "" : "s"} assigned to you`}
      />

      <Toolbar>
        <SegmentedFilter
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            ...f,
            count: f.value === "all" ? bookings.length : bookings.filter((row) => row.status === f.value).length,
          }))}
        />
      </Toolbar>

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
