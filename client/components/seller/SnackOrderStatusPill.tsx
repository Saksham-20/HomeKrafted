import clsx from "clsx";
import type { SnackOrderStatus } from "@/lib/types";
import styles from "./SnackOrderStatusPill.module.css";

const LABEL: Record<SnackOrderStatus, string> = {
  received: "Received",
  accepted: "Accepted",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
};

const VARIANT_CLASS: Record<SnackOrderStatus, string> = {
  received: styles.received,
  accepted: styles.accepted,
  "out-for-delivery": styles.outForDelivery,
  delivered: styles.delivered,
};

/** `SnackOrderStatus` pill — mirrors `OrderStatusPill`/`PickupStatusPill`'s visual convention for this third, unrelated status union. */
export function SnackOrderStatusPill({
  status,
  className,
}: {
  status: SnackOrderStatus;
  className?: string;
}) {
  return <span className={clsx(styles.pill, VARIANT_CLASS[status], className)}>{LABEL[status]}</span>;
}
