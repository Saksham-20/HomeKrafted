"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusTimeline, type StatusTimelineStep } from "@/components/ui/StatusTimeline";
import { OrderStatusPill } from "./OrderStatusPill";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  FULFILLMENT_SEQUENCE,
  advanceSellerOrderStatus,
  getAddressById,
  getProductById,
  getSellerOrder,
  nextFulfillmentStatus,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Address, Order, OrderStatus } from "@/lib/types";
import styles from "./MakerOrderDetailClient.module.css";

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export interface MakerOrderDetailClientProps {
  orderId: string;
}

/**
 * `/seller/orders/[id]` for `type: "maker"` sellers (M10a) — order
 * detail with a `StatusTimeline` over the fulfilment pipeline and an
 * "advance to next status" action. Items belonging to a *different*
 * vendor on the same order (a real multi-vendor marketplace order can
 * span sellers) render dimmed — visible for context, but not this
 * seller's to act on. Rendered by `SellerOrderDetailClient` (M10b's type
 * router) when `seller.type === "maker"`; otherwise unchanged from M10a.
 */
export function MakerOrderDetailClient({ orderId }: MakerOrderDetailClientProps) {
  const { ready, seller } = useAuth();
  const [order, setOrder] = useState<Order | undefined>(undefined);
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [itemVendorIds, setItemVendorIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!seller?.vendorId) return;
    const found = await getSellerOrder(seller.vendorId, orderId);
    setOrder(found);
    if (found) {
      const addressId = found.shippingAddressIds[0];
      if (addressId) setAddress(await getAddressById(addressId));

      const entries = await Promise.all(
        found.items.map(async (item) => {
          if (!item.productId) return [item.id, ""] as const;
          const product = await getProductById(item.productId);
          return [item.id, product?.vendorId ?? ""] as const;
        }),
      );
      setItemVendorIds(Object.fromEntries(entries));
    }
    setLoading(false);
  }, [seller, orderId]);

  useEffect(() => {
    if (!ready || !seller?.vendorId) return;
    (async () => {
      await load();
    })();
  }, [ready, seller, load]);

  async function handleAdvance() {
    setAdvancing(true);
    await advanceSellerOrderStatus(orderId);
    await load();
    setAdvancing(false);
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading order…</div>;
  }

  if (!order) {
    return <div className={styles.loading}>Order not found.</div>;
  }

  const isTerminalNonDelivered = order.status === "cancelled" || order.status === "returned";
  const next = nextFulfillmentStatus(order.status);
  const currentIndex = FULFILLMENT_SEQUENCE.indexOf(order.status);

  const steps: StatusTimelineStep[] = FULFILLMENT_SEQUENCE.map((status, index) => ({
    label: STATUS_LABEL[status],
    done: currentIndex >= 0 && index <= currentIndex,
    current: currentIndex >= 0 && index === currentIndex,
  }));

  return (
    <div>
      <SellerPageHeader
        title={`Order #${order.orderNumber}`}
        subtitle={`Placed ${formatDate(order.placedAt)}`}
        actions={<OrderStatusPill status={order.status} />}
      />

      <div className={styles.grid}>
        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Items</h2>
            {order.items.map((item) => {
              const isOwn = seller?.vendorId ? itemVendorIds[item.id] === seller.vendorId : false;
              return (
                <div key={item.id} className={clsx(styles.itemRow, !isOwn && styles.otherVendor)}>
                  <div>
                    <div className={styles.itemName}>{item.name}</div>
                    <div className={styles.itemMeta}>
                      Qty {item.quantity}
                      {!isOwn ? " · another seller" : ""}
                      {item.giftWrap ? " · gift wrapped" : ""}
                    </div>
                  </div>
                  <span className={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</span>
                </div>
              );
            })}
          </Card>

          <Card className={clsx(styles.card, styles.cardSpaced)}>
            <h2 className={styles.cardTitle}>Fulfilment status</h2>
            {isTerminalNonDelivered ? (
              <p className={styles.terminalNote}>
                This order was {order.status} — no further status changes.
              </p>
            ) : (
              <>
                <StatusTimeline steps={steps} orientation="horizontal" />
                {next && (
                  <Button variant="primary" onClick={handleAdvance} disabled={advancing}>
                    {advancing ? "Updating…" : `Mark as ${STATUS_LABEL[next]}`}
                  </Button>
                )}
              </>
            )}
          </Card>
        </div>

        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Order summary</h2>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Shipping</span>
              <span>{order.shippingFee > 0 ? formatCurrency(order.shippingFee) : "Free"}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Payment</span>
              <span>{order.paymentMethod}</span>
            </div>
          </Card>

          {address && (
            <Card className={clsx(styles.card, styles.cardSpaced)}>
              <h2 className={styles.cardTitle}>Ship to</h2>
              <div className={styles.addressBlock}>
                {address.recipientName}
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                <br />
                {address.city}, {address.state} {address.pincode}
              </div>
            </Card>
          )}
        </div>
      </div>

      <p className={styles.backLink}>
        <Link href="/seller/orders">← Back to orders</Link>
      </p>
    </div>
  );
}
