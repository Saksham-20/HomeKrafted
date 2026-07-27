import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PickupStatusPill } from "./PickupStatusPill";
import { formatCurrency, formatDate } from "@/lib/format";
import type { LaundryBooking } from "@/lib/types";
import styles from "./PickupRow.module.css";

export interface PickupRowProps {
  booking: LaundryBooking;
  /** e.g. "Wash & Fold" — the first line's service name, resolved by the caller (needs a `LaundryService` lookup this component doesn't own, same split `OrderRow.itemsLabel` uses). */
  serviceLabel: string;
  href: string;
}

/** Pickup list row — booking number, pickup/delivery dates, service, status pill, estimated total. Reused on `/seller` (laundry partner dashboard preview) and `/seller/pickups` (full list). */
export function PickupRow({ booking, serviceLabel, href }: PickupRowProps) {
  return (
    <Link href={href} className={styles.linkWrap}>
      <Card hoverable padding="sm" className={styles.row}>
        <div className={styles.body}>
          <span className={styles.bookingNumber}>#{booking.bookingNumber}</span>
          <span className={styles.meta}>
            {serviceLabel} · Pickup {formatDate(booking.pickupSlot.date)} · Delivery{" "}
            {formatDate(booking.deliverySlot.date)}
          </span>
        </div>
        <div className={styles.right}>
          <PickupStatusPill status={booking.status} />
          <span className={styles.total}>{formatCurrency(booking.estimatedTotal)}</span>
        </div>
      </Card>
    </Link>
  );
}
