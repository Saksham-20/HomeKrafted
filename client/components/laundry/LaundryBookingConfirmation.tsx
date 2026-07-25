import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusTimeline } from "@/components/ui/StatusTimeline";
import { formatCurrency } from "@/lib/format";
import type { LaundryBooking, LaundryDay, LaundryService, LaundrySlot } from "@/lib/types";
import styles from "./LaundryBookingConfirmation.module.css";

export interface LaundryBookingConfirmationProps {
  booking: LaundryBooking;
  service: LaundryService | undefined;
  days: LaundryDay[];
  slots: LaundrySlot[];
  onBookAnother: () => void;
}

const PAYMENT_LABEL: Record<LaundryBooking["paymentMethod"], string> = {
  wallet: "Paid from wallet",
  razorpay: "Card / UPI",
  cod: "Cash on delivery",
};

function slotSummary(
  slot: { date: string; slotId: string },
  days: LaundryDay[],
  slots: LaundrySlot[],
): string {
  const day = days.find((d) => d.isoDate === slot.date);
  const timeSlot = slots.find((s) => s.id === slot.slotId);
  return `${day ? `${day.day}, ${day.date}` : slot.date} · ${timeSlot?.label ?? ""}`;
}

/**
 * Post-place-booking confirmation state (M4) — rendered in place of the
 * booking form, not a separate route, mirroring Checkout's
 * `OrderConfirmation` pattern: booking number + a basic status line
 * (scheduled → picked-up → in-progress → out-for-delivery → delivered,
 * first step done), no live map/rider tracking — that lives in
 * `<AppTrackingBand>`, rendered alongside this by the parent. Full
 * booking history/detail is `/account/orders` in M7 (unified with
 * Marketplace orders) — this is just the immediate "you're booked" screen.
 */
export function LaundryBookingConfirmation({
  booking,
  service,
  days,
  slots,
  onBookAnother,
}: LaundryBookingConfirmationProps) {
  const line = booking.lines[0];
  const qty = line?.estimatedWeightKg ?? line?.itemCount ?? line?.estimatedHours ?? 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <CheckCircle2 size={44} strokeWidth={1.5} className={styles.icon} />
        <h1 className={styles.title}>Pickup scheduled!</h1>
        <p className={styles.bookingNumber}>
          Booking <strong>#{booking.bookingNumber}</strong>
        </p>
        <p className={styles.copy}>
          We&rsquo;ll send updates on WhatsApp and email as your laundry moves along.
        </p>
      </div>

      <div className={styles.card}>
        <StatusTimeline
          orientation="horizontal"
          steps={[
            { label: "Scheduled", done: true },
            { label: "Picked up", done: false },
            { label: "In progress", done: false },
            { label: "Out for delivery", done: false },
            { label: "Delivered", done: false },
          ]}
        />
      </div>

      <div className={styles.card}>
        <span className={styles.cardTitle}>Booking summary</span>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span>
              {service?.name ?? "Service"} (est. {qty} {service?.unitLabel})
            </span>
            <span>{formatCurrency(booking.estimatedTotal)}</span>
          </div>
          <div className={styles.row}>
            <span>Pickup</span>
            <span>{slotSummary(booking.pickupSlot, days, slots)}</span>
          </div>
          <div className={styles.row}>
            <span>Delivery</span>
            <span>{slotSummary(booking.deliverySlot, days, slots)}</span>
          </div>
          {booking.subscriptionId && (
            <div className={styles.row}>
              <span>Subscription</span>
              <span>Active</span>
            </div>
          )}
          <div className={styles.row}>
            <span>Payment</span>
            <span>{PAYMENT_LABEL[booking.paymentMethod]}</span>
          </div>
        </div>
        <div className={styles.totalRow}>
          <span>Estimated total</span>
          <span>{formatCurrency(booking.estimatedTotal)}</span>
        </div>
        {booking.walletCashback !== undefined && (
          <p className={styles.cashback}>
            Earn {formatCurrency(booking.walletCashback)} wallet cashback once delivered
          </p>
        )}
        <p className={styles.footnote}>Final price weighed at pickup.</p>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" onClick={onBookAnother}>
          Book another pickup
        </Button>
        <p className={styles.footnote}>
          Track this booking any time from Account → Orders.
        </p>
      </div>
    </div>
  );
}
