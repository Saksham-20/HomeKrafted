import clsx from "clsx";
import styles from "./StatusPill.module.css";

export type StatusPillTone = "neutral" | "pine" | "gold" | "success" | "danger" | "solid";

/**
 * One tone map covering every status string the admin surface renders a
 * pill for — marketplace `OrderStatus`, `LaundryBookingStatus`,
 * `SnackOrderStatus`, `SellerApplicationStatus`, `SellerStatus`, plus the
 * two ad hoc user-suspension labels (`"active"`/`"suspended"`) that
 * aren't a real enum on `User` (just `suspended?: boolean`, rendered as
 * a status string by the caller). One shared component + map, rather
 * than a status pill per domain (`OrderStatusPill`/`PickupStatusPill`/
 * `SnackOrderStatusPill` in `components/seller/`) — those predate this
 * and are left as-is (not in M11a's scope to refactor), but the admin
 * surface only ever needs read-only status display across many
 * different small unions, so one generic component pays for itself here
 * instead of five near-identical files.
 */
const TONE_BY_STATUS: Record<string, StatusPillTone> = {
  // marketplace OrderStatus
  placed: "neutral",
  confirmed: "pine",
  packed: "gold",
  shipped: "solid",
  delivered: "success",
  cancelled: "danger",
  returned: "danger",
  // laundry LaundryBookingStatus
  scheduled: "pine",
  "picked-up": "gold",
  "in-progress": "solid",
  "out-for-delivery": "solid",
  // snack SnackOrderStatus
  received: "neutral",
  accepted: "gold",
  // SellerApplicationStatus / SellerStatus / user suspension label
  new: "neutral",
  reviewing: "gold",
  waitlisted: "gold",
  approved: "success",
  rejected: "danger",
  pending: "gold",
  suspended: "danger",
  active: "success",
  // Product.moderationStatus / Review moderation (M11b `/admin/catalog`)
  hidden: "danger",
  flagged: "gold",
  visible: "success",
};

export function statusTone(status: string): StatusPillTone {
  return TONE_BY_STATUS[status] ?? "neutral";
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export interface StatusPillProps {
  status: string;
  /** Override the auto-derived (title-cased) label — e.g. a role string that should read differently than its raw value. */
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <span className={clsx(styles.pill, styles[statusTone(status)], className)}>
      {label ?? titleCase(status)}
    </span>
  );
}
