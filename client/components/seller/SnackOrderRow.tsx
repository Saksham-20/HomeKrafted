import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SnackOrderStatusPill } from "./SnackOrderStatusPill";
import { formatCurrency, formatDate } from "@/lib/format";
import type { SnackOrder } from "@/lib/types";
import styles from "./SnackOrderRow.module.css";

export interface SnackOrderRowProps {
  order: SnackOrder;
  href: string;
}

/** `SnackOrder` list row — customer, item summary, status pill, total. Reused on `/seller` (snack seller dashboard preview) and `/seller/orders` (full list, snack type). */
export function SnackOrderRow({ order, href }: SnackOrderRowProps) {
  const itemsLabel = order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ");
  return (
    <Link href={href} className={styles.linkWrap}>
      <Card hoverable padding="sm" className={styles.row}>
        <div className={styles.body}>
          <span className={styles.customer}>{order.customerName}</span>
          <span className={styles.meta}>
            {formatDate(order.createdAt)} · {itemsLabel}
          </span>
        </div>
        <div className={styles.right}>
          <SnackOrderStatusPill status={order.status} />
          <span className={styles.total}>{formatCurrency(order.total)}</span>
        </div>
      </Card>
    </Link>
  );
}
