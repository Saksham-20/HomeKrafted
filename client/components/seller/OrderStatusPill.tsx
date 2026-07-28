import clsx from "clsx";
import type { OrderStatus } from "@/lib/types";
import styles from "./OrderStatusPill.module.css";

const LABEL: Record<OrderStatus, string> = {
  // M8.4a: `OrderStatus` gained `"pending-payment"` for the real client
  // swap (`docs/API.md`'s M8.2 seam) — the seller portal itself stays
  // mock until M8.4b, so this is purely a type-completeness fix, not a
  // seller-facing feature (a seller can't fulfil an unpaid order anyway;
  // `POST /seller/orders/:id/advance` already 409s on it server-side).
  "pending-payment": "Payment pending",
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const VARIANT_CLASS: Record<OrderStatus, string> = {
  "pending-payment": styles.placed,
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
