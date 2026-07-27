"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusTimeline, type StatusTimelineStep } from "@/components/ui/StatusTimeline";
import { SnackOrderStatusPill } from "./SnackOrderStatusPill";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  SNACK_ORDER_SEQUENCE,
  advanceSnackOrderStatus,
  getSnackOrder,
  nextSnackOrderStatus,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { SnackOrder, SnackOrderStatus } from "@/lib/types";
import styles from "./SnackOrderDetailClient.module.css";

const STATUS_LABEL: Record<SnackOrderStatus, string> = {
  received: "Received",
  accepted: "Accepted",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
};

export interface SnackOrderDetailClientProps {
  orderId: string;
}

/**
 * `/seller/orders/[id]` for `type: "snack"` sellers (M10b) — order
 * detail with a `StatusTimeline` over `SNACK_ORDER_SEQUENCE` (the exact
 * WhatsApp status timeline the consumer sees on `/snacks`) and an
 * "advance to next status" action. Rendered by `SellerOrderDetailClient`'s
 * type router; mirrors `MakerOrderDetailClient`'s shape one level down.
 * `tone="whatsapp"` on `StatusTimeline` matches the reserved-for-Snacks
 * green dots the consumer side already uses for this exact sequence.
 */
export function SnackOrderDetailClient({ orderId }: SnackOrderDetailClientProps) {
  const { ready, seller } = useAuth();
  const [order, setOrder] = useState<SnackOrder | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!seller) return;
    const found = await getSnackOrder(seller.id, orderId);
    setOrder(found);
    setLoading(false);
  }, [seller, orderId]);

  useEffect(() => {
    if (!ready || !seller) return;
    (async () => {
      await load();
    })();
  }, [ready, seller, load]);

  async function handleAdvance() {
    setAdvancing(true);
    await advanceSnackOrderStatus(orderId);
    await load();
    setAdvancing(false);
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading order…</div>;
  }

  if (!order) {
    return <div className={styles.loading}>Order not found.</div>;
  }

  const next = nextSnackOrderStatus(order.status);
  const currentIndex = SNACK_ORDER_SEQUENCE.indexOf(order.status);

  const steps: StatusTimelineStep[] = SNACK_ORDER_SEQUENCE.map((status, index) => ({
    label: STATUS_LABEL[status],
    done: currentIndex >= 0 && index <= currentIndex,
    current: currentIndex >= 0 && index === currentIndex,
  }));

  return (
    <div>
      <SellerPageHeader
        title={order.customerName}
        subtitle={`Ordered ${formatDate(order.createdAt)} · via WhatsApp`}
        actions={<SnackOrderStatusPill status={order.status} />}
      />

      <div className={styles.grid}>
        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Items</h2>
            {order.items.map((item) => (
              <div key={item.snackId} className={styles.itemRow}>
                <div>
                  <div className={styles.itemName}>{item.name}</div>
                  <div className={styles.itemMeta}>Qty {item.quantity}</div>
                </div>
                <span className={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </Card>

          <Card className={clsx(styles.card, styles.cardSpaced)}>
            <h2 className={styles.cardTitle}>Order status</h2>
            <StatusTimeline steps={steps} orientation="horizontal" tone="whatsapp" />
            {next && (
              <Button variant="primary" onClick={handleAdvance} disabled={advancing}>
                {advancing ? "Updating…" : `Mark as ${STATUS_LABEL[next]}`}
              </Button>
            )}
          </Card>
        </div>

        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Order summary</h2>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Channel</span>
              <span>WhatsApp</span>
            </div>
          </Card>

          <Card className={clsx(styles.card, styles.cardSpaced)}>
            <h2 className={styles.cardTitle}>Customer</h2>
            <div className={styles.addressBlock}>
              {order.customerName}
              <br />
              {order.customerPhone}
            </div>
          </Card>
        </div>
      </div>

      <p className={styles.backLink}>
        <Link href="/seller/orders">← Back to orders</Link>
      </p>
    </div>
  );
}
