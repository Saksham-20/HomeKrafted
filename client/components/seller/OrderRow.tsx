import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { OrderStatusPill } from "./OrderStatusPill";
import { formatCurrency, formatDate } from "@/lib/format";
import type { SellerOrder } from "@/lib/types";
import styles from "./OrderRow.module.css";

export interface OrderRowProps {
  order: SellerOrder;
  /** e.g. "Mango Thokku Pickle ×2" — already this seller's line items only (`describeSellerOrderItems`). */
  itemsLabel: string;
  href: string;
}

/**
 * Order list row — order number, placed date, this seller's items,
 * status pill, and this seller's own share (`itemsSubtotal`, M37).
 * Reused on `/seller` (recent orders preview) and `/seller/orders` (the
 * full list). The whole-order total is deliberately absent: a
 * multi-vendor order's basket total was never this kitchen's number, and
 * payouts are computed from the share shown here.
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
          <span className={styles.total}>{formatCurrency(order.itemsSubtotal)}</span>
        </div>
      </Card>
    </Link>
  );
}
