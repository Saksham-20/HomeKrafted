import clsx from "clsx";
import type { OrderStatus } from "@/lib/types";
import styles from "./OrderStatusPill.module.css";

const LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const VARIANT_CLASS: Record<OrderStatus, string> = {
  placed: styles.placed,
  confirmed: styles.confirmed,
  packed: styles.packed,
  shipped: styles.shipped,
  delivered: styles.delivered,
  cancelled: styles.cancelled,
  returned: styles.returned,
};

export function OrderStatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  return <span className={clsx(styles.pill, VARIANT_CLASS[status], className)}>{LABEL[status]}</span>;
}
