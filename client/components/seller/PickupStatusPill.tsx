import clsx from "clsx";
import type { LaundryBookingStatus } from "@/lib/types";
import styles from "./PickupStatusPill.module.css";

const LABEL: Record<LaundryBookingStatus, string> = {
  scheduled: "Scheduled",
  "picked-up": "Picked up",
  "in-progress": "In progress",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const VARIANT_CLASS: Record<LaundryBookingStatus, string> = {
  scheduled: styles.scheduled,
  "picked-up": styles.pickedUp,
  "in-progress": styles.inProgress,
  "out-for-delivery": styles.outForDelivery,
  delivered: styles.delivered,
  cancelled: styles.cancelled,
};

/** `LaundryBookingStatus` pill — same visual convention as `OrderStatusPill`, kept as a separate component since the two status unions don't overlap. */
export function PickupStatusPill({
  status,
  className,
}: {
  status: LaundryBookingStatus;
  className?: string;
}) {
  return <span className={clsx(styles.pill, VARIANT_CLASS[status], className)}>{LABEL[status]}</span>;
}
