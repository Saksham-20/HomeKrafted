"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { StatusTimeline, type StatusTimelineStep } from "@/components/ui/StatusTimeline";
import { PickupStatusPill } from "./PickupStatusPill";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  BOOKING_SEQUENCE,
  advancePartnerBookingStatus,
  getAddressById,
  getPartnerBooking,
  nextBookingStatus,
  apiErrorMessage,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Address, LaundryBookingStatus, LaundryBooking } from "@/lib/types";
import styles from "./PartnerPickupDetailClient.module.css";

const STATUS_LABEL: Record<LaundryBookingStatus, string> = {
  scheduled: "Scheduled",
  "picked-up": "Picked up",
  "in-progress": "In progress",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export interface PartnerPickupDetailClientProps {
  bookingId: string;
}

/**
 * `/seller/pickups/[id]` (M10b, laundry type) — booking detail with a
 * `StatusTimeline` over `BOOKING_SEQUENCE` and an "advance to next
 * status" action. No consumer live-map here either — status only, same
 * channel rule as the consumer-facing booking detail. Mirrors
 * `SellerOrderDetailClient`'s shape for the maker `Order` flow, one
 * level down.
 *
 * The slot-editing card left in M37 with the withdrawn module's browse
 * API: its "Save slots" had been mock-only in every mode (the write
 * never reached the server — see the old `updatePartnerBookingSlots`
 * doc), so it was a control that looked like it worked and didn't.
 */
export function PartnerPickupDetailClient({ bookingId }: PartnerPickupDetailClientProps) {
  const { ready, seller } = useAuth();
  const [booking, setBooking] = useState<LaundryBooking | undefined>(undefined);
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seller) return;
    const found = await getPartnerBooking(seller.id, bookingId);
    setBooking(found);
    if (found) {
      setAddress(await getAddressById(found.addressId));
    }
    setLoading(false);
  }, [seller, bookingId]);

  useEffect(() => {
    if (!ready || !seller) return;
    (async () => {
      await load();
    })();
  }, [ready, seller, load]);

  async function handleAdvance() {
    setAdvancing(true);
    setError(null);
    try {
      await advancePartnerBookingStatus(bookingId);
      await load();
    } catch (err) {
      // A refused advance used to leave the button on "Updating…"
      // permanently, with the order unmoved and nothing said — on the
      // screen a HomeKrafter uses to run every order they take.
      setError(apiErrorMessage(err, "Couldn't update this order. Try again."));
    } finally {
      setAdvancing(false);
    }
  }

  if (!ready || loading) {
    return <RouteSkeleton variant="page" message={kitchenLoading("seller/pickup", MAKER_LOADING)} />;
  }

  if (!booking) {
    return (
      <NotFoundCard
        title="We couldn’t find that booking"
        body="No pickup assigned to you matches this id. It may have been reassigned or cancelled."
        backHref="/seller/pickups"
        backLabel="Back to pickups"
      />
    );
  }

  const isCancelled = booking.status === "cancelled";
  const next = nextBookingStatus(booking.status);
  const currentIndex = BOOKING_SEQUENCE.indexOf(booking.status);

  const steps: StatusTimelineStep[] = BOOKING_SEQUENCE.map((status, index) => ({
    label: STATUS_LABEL[status],
    done: currentIndex >= 0 && index <= currentIndex,
    current: currentIndex >= 0 && index === currentIndex,
  }));

  return (
    <div>
      <SellerPageHeader
        title={`Booking #${booking.bookingNumber}`}
        subtitle={`Placed ${formatDate(booking.createdAt)}`}
        actions={<PickupStatusPill status={booking.status} />}
      />

      <div className={styles.grid}>
        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Service</h2>
            {booking.lines.map((line, index) => {
              const qty = line.estimatedWeightKg
                ? `${line.estimatedWeightKg} kg`
                : line.itemCount
                  ? `${line.itemCount} item${line.itemCount === 1 ? "" : "s"}`
                  : line.estimatedHours
                    ? `${line.estimatedHours} hr`
                    : "";
              return (
                <div key={index} className={styles.itemRow}>
                  <div>
                    <div className={styles.itemName}>{line.serviceName ?? "Service"}</div>
                    <div className={styles.itemMeta}>{qty}</div>
                  </div>
                  <span className={styles.itemPrice}>{formatCurrency(line.estimatedPrice)}</span>
                </div>
              );
            })}
            {booking.specialInstructions && (
              <p className={styles.instructions}>&ldquo;{booking.specialInstructions}&rdquo;</p>
            )}
          </Card>

          <Card className={clsx(styles.card, styles.cardSpaced)}>
            <h2 className={styles.cardTitle}>Fulfilment status</h2>
            {isCancelled ? (
              <p className={styles.terminalNote}>This booking was cancelled — no further status changes.</p>
            ) : (
              <>
                <StatusTimeline steps={steps} orientation="horizontal" />
                {next && (
                  <Button variant="primary" onClick={handleAdvance} disabled={advancing}>
                    {advancing ? "Updating…" : `Mark as ${STATUS_LABEL[next]}`}
                  </Button>
                )}
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
          </Card>

        </div>

        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Booking summary</h2>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Estimated total</span>
              <span>{formatCurrency(booking.estimatedTotal)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Payment</span>
              <span>{booking.paymentMethod}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Pickup</span>
              <span>
                {formatDate(booking.pickupSlot.date)} · {booking.pickupSlotLabel ?? ""}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Delivery</span>
              <span>
                {formatDate(booking.deliverySlot.date)} · {booking.deliverySlotLabel ?? ""}
              </span>
            </div>
          </Card>

          {address && (
            <Card className={clsx(styles.card, styles.cardSpaced)}>
              <h2 className={styles.cardTitle}>Pickup address</h2>
              <div className={styles.addressBlock}>
                {address.recipientName}
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                <br />
                {address.city}, {address.state} {address.pincode}
              </div>
            </Card>
          )}
        </div>
      </div>

      <p className={styles.backLink}>
        <Link href="/seller/pickups">← Back to pickups</Link>
      </p>
    </div>
  );
}
