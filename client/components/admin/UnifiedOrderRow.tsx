import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "./StatusPill";
import { formatCurrency, formatDate } from "@/lib/format";
import type { AdminOrderSummary } from "@/lib/api";
import styles from "./UnifiedOrderRow.module.css";

const TYPE_LABEL: Record<AdminOrderSummary["type"], string> = {
  marketplace: "Marketplace",
  laundry: "Laundry",
  snack: "Snacks",
};

export interface UnifiedOrderRowProps {
  order: AdminOrderSummary;
}

/** `/admin/orders` list row — one row shape across all 3 source tables (marketplace `Order`/`LaundryBooking`/`SnackOrder`), type tag distinguishing which. */
export function UnifiedOrderRow({ order }: UnifiedOrderRowProps) {
  return (
    <Link
      href={`/admin/orders/${order.type}/${order.id.slice(order.id.indexOf(":") + 1)}`}
      className={styles.linkWrap}
    >
      <Card hoverable padding="sm" className={styles.row}>
        <span className={styles.typeTag}>{TYPE_LABEL[order.type]}</span>
        <div className={styles.body}>
          <span className={styles.reference}>#{order.reference}</span>
          <span className={styles.meta}>
            {formatDate(order.placedAt)} · {order.customerName} · {order.sellerNames.join(", ")}
          </span>
        </div>
        <div className={styles.right}>
          <StatusPill status={order.status} />
          <span className={styles.total}>{formatCurrency(order.total)}</span>
        </div>
      </Card>
    </Link>
  );
}
