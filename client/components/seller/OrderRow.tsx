import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { OrderStatusPill } from "./OrderStatusPill";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./OrderRow.module.css";

export interface OrderRowProps {
  order: Order;
  /** e.g. "Mango Thokku Pickle ×2" — this seller's line items only, computed by the caller (needs a product lookup OrderRow doesn't own). */
  itemsLabel: string;
  href: string;
}

/**
 * Order list row — order number, placed date, this seller's items,
 * status pill, order total. Reused on `/seller` (recent orders preview)
 * and `/seller/orders` (the full list). The order `total` shown is the
 * whole order's total (a real multi-vendor marketplace order can span
 * more than one seller) rather than this seller's share — flagged here
 * since a real payouts reconciliation would need a per-line-item split.
 */
export function OrderRow({ order, itemsLabel, href }: OrderRowProps) {
  return (
    <Link href={href} className={styles.linkWrap}>
      <Card hoverable padding="sm" className={styles.row}>
        <div className={styles.body}>
          <span className={styles.orderNumber}>#{order.orderNumber}</span>
          <span className={styles.meta}>
            {formatDate(order.placedAt)} · {itemsLabel}
          </span>
        </div>
        <div className={styles.right}>
          <OrderStatusPill status={order.status} />
          <span className={styles.total}>{formatCurrency(order.total)}</span>
        </div>
      </Card>
    </Link>
  );
}
