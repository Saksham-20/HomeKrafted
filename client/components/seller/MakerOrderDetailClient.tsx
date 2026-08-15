"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { StatusTimeline, type StatusTimelineStep } from "@/components/ui/StatusTimeline";
import { OrderStatusPill } from "./OrderStatusPill";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  FULFILLMENT_SEQUENCE,
  advanceSellerOrderStatus,
  getAddressById,
  getSellerOrder,
  nextFulfillmentStatus,
  apiErrorMessage,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Address, OrderStatus, SellerOrder } from "@/lib/types";
import styles from "./MakerOrderDetailClient.module.css";

const STATUS_LABEL: Record<OrderStatus, string> = {
  // M8.4a type-completeness fix — see `OrderStatusPill`'s identical comment.
  "pending-payment": "Payment pending",
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
 * `/seller/orders/[id]` — order detail with a `StatusTimeline` over the
 * fulfilment pipeline and an "advance to next status" action. Since M37
 * the payload is the seller-scoped `SellerOrder`: only this kitchen's own
 * line items arrive, and `itemsSubtotal` is their share rather than the
 * buyer's total. On an order shared with another kitchen (`multiVendor`),
 * `shipped`/`delivered` are recorded by the Homekrafted team — the button
 * explains instead of offering a move that the server would 403.
 */
export function MakerOrderDetailClient({ orderId }: MakerOrderDetailClientProps) {
  const { ready, seller } = useAuth();
  const [order, setOrder] = useState<SellerOrder | undefined>(undefined);
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seller?.vendorId) return;
    const found = await getSellerOrder(seller.vendorId, orderId);
    setOrder(found);
    if (found) {
      const addressId = found.shippingAddressIds[0];
      if (addressId) setAddress(await getAddressById(addressId));
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
    if (!seller?.vendorId) return;
    setAdvancing(true);
    setError(null);
    try {
      await advanceSellerOrderStatus(seller.vendorId, orderId);
      await load();
    } catch (err) {
      // A refused advance used to leave the button on "Updating…"
      // permanently, with the order unmoved and nothing said — on the
      // screen a HomeKrafter uses to run every order they take.
      setError(apiErrorMessage(err, "Couldn't update this order. Try again."));
    } finally {
      setAdvancing(false);
    }
  }

  if (!ready || loading) {
    return <RouteSkeleton variant="page" message={kitchenLoading("seller/maker-order", MAKER_LOADING)} />;
  }

  if (!order) {
    return (
      <NotFoundCard
        title="We couldn’t find that order"
        body="No order containing one of your items matches this id. It may have been opened from a stale tab."
        backHref="/seller/orders"
        backLabel="Back to orders"
      />
    );
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
            <h2 className={styles.cardTitle}>Your items</h2>
            {order.items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <div>
                  <div className={styles.itemName}>{item.name}</div>
                  <div className={styles.itemMeta}>
                    Qty {item.quantity}
                    {item.giftWrap ? " · gift wrapped" : ""}
                  </div>
                </div>
                <span className={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
            {order.multiVendor && (
              <p className={styles.itemMeta}>
                Another HomeKrafter&apos;s items are also on this order — only yours are
                listed here.
              </p>
            )}
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
                {next &&
                  (order.multiVendor && (next === "shipped" || next === "delivered") ? (
                    <p className={styles.terminalNote}>
                      This order also contains another HomeKrafter&apos;s items, so
                      shipping and delivery are recorded for the whole order at once
                      by the Homekrafted team. Mention order #{order.orderNumber} to
                      support when your part is ready.
                    </p>
                  ) : (
                    <Button variant="primary" onClick={handleAdvance} disabled={advancing}>
                      {advancing ? "Updating…" : `Mark as ${STATUS_LABEL[next]}`}
                    </Button>
                  ))}
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
          </Card>
        </div>

        <div>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>Your share</h2>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Your items</span>
              <span>{formatCurrency(order.itemsSubtotal)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Payment</span>
              <span>{order.paymentMethod}</span>
            </div>
            <p className={styles.itemMeta}>
              This is the figure your payout is computed from — the buyer&apos;s
              basket total isn&apos;t shown here.
            </p>
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
