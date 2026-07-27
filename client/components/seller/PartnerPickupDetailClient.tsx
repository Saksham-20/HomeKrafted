"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusTimeline, type StatusTimelineStep } from "@/components/ui/StatusTimeline";
import { PickupStatusPill } from "./PickupStatusPill";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  BOOKING_SEQUENCE,
  advancePartnerBookingStatus,
  getAddressById,
  getLaundryDays,
  getLaundryServices,
  getLaundrySlots,
  getPartnerBooking,
  nextBookingStatus,
  updatePartnerBookingSlots,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Address, LaundryBookingStatus, LaundryBooking, LaundryDay, LaundryService, LaundrySlot } from "@/lib/types";
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
 * `StatusTimeline` over `BOOKING_SEQUENCE`, an "advance to next status"
 * action, and editable pickup/delivery slot pickers (the brief's "set/
 * confirm the two slots"). No consumer live-map here either — status
 * only, same channel rule as the consumer-facing booking detail. Mirrors
 * `SellerOrderDetailClient`'s shape for the maker `Order` flow, one
 * level down.
 */
export function PartnerPickupDetailClient({ bookingId }: PartnerPickupDetailClientProps) {
  const { ready, seller } = useAuth();
  const [booking, setBooking] = useState<LaundryBooking | undefined>(undefined);
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [days, setDays] = useState<LaundryDay[]>([]);
  const [slots, setSlots] = useState<LaundrySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);
  const [slotsSaved, setSlotsSaved] = useState(false);

  const [pickupDate, setPickupDate] = useState("");
  const [pickupSlotId, setPickupSlotId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliverySlotId, setDeliverySlotId] = useState("");

  const load = useCallback(async () => {
    if (!seller) return;
    const found = await getPartnerBooking(seller.id, bookingId);
    setBooking(found);
    if (found) {
      setAddress(await getAddressById(found.addressId));
      setPickupDate(found.pickupSlot.date);
      setPickupSlotId(found.pickupSlot.slotId);
      setDeliveryDate(found.deliverySlot.date);
      setDeliverySlotId(found.deliverySlot.slotId);
    }
    setLoading(false);
  }, [seller, bookingId]);

  useEffect(() => {
    if (!ready || !seller) return;
    (async () => {
      const [serviceList, dayList, slotList] = await Promise.all([
        getLaundryServices(),
        getLaundryDays(),
        getLaundrySlots(),
      ]);
      setServices(serviceList);
      setDays(dayList);
      setSlots(slotList);
      await load();
    })();
  }, [ready, seller, load]);

  async function handleAdvance() {
    setAdvancing(true);
    await advancePartnerBookingStatus(bookingId);
    await load();
    setAdvancing(false);
  }

  async function handleSaveSlots() {
    if (!pickupDate || !pickupSlotId || !deliveryDate || !deliverySlotId) return;
    setSavingSlots(true);
    await updatePartnerBookingSlots(bookingId, {
      pickupSlot: { date: pickupDate, slotId: pickupSlotId },
      deliverySlot: { date: deliveryDate, slotId: deliverySlotId },
    });
    await load();
    setSavingSlots(false);
    setSlotsSaved(true);
    setTimeout(() => setSlotsSaved(false), 2500);
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading pickup…</div>;
  }

  if (!booking) {
    return <div className={styles.loading}>Booking not found.</div>;
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
              const service = services.find((s) => s.id === line.serviceId);
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
                    <div className={styles.itemName}>{service?.name ?? "Service"}</div>
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
              </>
            )}
          </Card>

          {!isCancelled && (
            <Card className={clsx(styles.card, styles.cardSpaced)}>
              <h2 className={styles.cardTitle}>Set / confirm slots</h2>
              <div className={styles.slotGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Pickup day</span>
                  <select
                    className={styles.select}
                    value={pickupDate}
                    onChange={(event) => setPickupDate(event.target.value)}
                  >
                    <option value="">Select day</option>
                    {days.map((d) => (
                      <option key={d.id} value={d.isoDate}>
                        {d.day} {d.date}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Pickup slot</span>
                  <select
                    className={styles.select}
                    value={pickupSlotId}
                    onChange={(event) => setPickupSlotId(event.target.value)}
                  >
                    <option value="">Select slot</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Delivery day</span>
                  <select
                    className={styles.select}
                    value={deliveryDate}
                    onChange={(event) => setDeliveryDate(event.target.value)}
                  >
                    <option value="">Select day</option>
                    {days.map((d) => (
                      <option key={d.id} value={d.isoDate}>
                        {d.day} {d.date}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Delivery slot</span>
                  <select
                    className={styles.select}
                    value={deliverySlotId}
                    onChange={(event) => setDeliverySlotId(event.target.value)}
                  >
                    <option value="">Select slot</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.slotActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveSlots}
                  disabled={savingSlots || !pickupDate || !pickupSlotId || !deliveryDate || !deliverySlotId}
                >
                  {savingSlots ? "Saving…" : "Save slots"}
                </Button>
                {slotsSaved && <span className={styles.savedNote}>Saved.</span>}
              </div>
            </Card>
          )}
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
                {formatDate(booking.pickupSlot.date)} ·{" "}
                {slots.find((s) => s.id === booking.pickupSlot.slotId)?.label}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Delivery</span>
              <span>
                {formatDate(booking.deliverySlot.date)} ·{" "}
                {slots.find((s) => s.id === booking.deliverySlot.slotId)?.label}
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
