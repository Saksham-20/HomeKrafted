import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusTimeline } from "@/components/ui/StatusTimeline";
import { formatCurrency } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./OrderConfirmation.module.css";

export interface OrderConfirmationProps {
  order: Order;
  onContinueShopping: () => void;
}

/**
 * Post-place-order confirmation state (M3) — rendered in place of the
 * checkout form, not a separate route: order number + a basic status
 * stepper (placed → confirmed → packed → shipped → delivered, first step
 * done), no live tracking. Full order history/detail is `/account/orders`
 * in M7 — this is just the immediate "you're done" screen.
 */
export function OrderConfirmation({ order, onContinueShopping }: OrderConfirmationProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <CheckCircle2 size={44} strokeWidth={1.5} className={styles.icon} />
        <h1 className={styles.title}>Order placed!</h1>
        <p className={styles.orderNumber}>
          Order <strong>#{order.orderNumber}</strong>
        </p>
        <p className={styles.copy}>
          We&rsquo;ll send updates on WhatsApp and email as it moves along.
        </p>
      </div>

      <div className={styles.card}>
        <StatusTimeline
          orientation="horizontal"
          steps={[
            { label: "Placed", done: true },
            { label: "Confirmed", done: false, current: false },
            { label: "Packed", done: false },
            { label: "Shipped", done: false },
            { label: "Delivered", done: false },
          ]}
        />
      </div>

      <div className={styles.card}>
        <span className={styles.cardTitle}>Order summary</span>
        <div className={styles.items}>
          {order.items.map((item) => (
            <div key={item.id} className={styles.itemRow}>
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>{formatCurrency(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className={styles.totals}>
          <div className={styles.itemRow}>
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className={styles.itemRow}>
            <span>Shipping</span>
            <span>{order.shippingFee === 0 ? "Free" : formatCurrency(order.shippingFee)}</span>
          </div>
          {order.walletApplied > 0 && (
            <div className={styles.itemRow}>
              <span>Paid from wallet</span>
              <span>− {formatCurrency(order.walletApplied)}</span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>
        <p className={styles.cashback}>
          Earn {formatCurrency(order.cashbackEarned)} wallet cashback on this order
        </p>
        {order.gift?.isGift && (
          <p className={styles.giftNote}>
            🎁 Sent as a gift to {order.gift.recipientName ?? "your recipient"}
            {order.gift.hidePrice ? " — prices hidden on their copy." : "."}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="primary" onClick={onContinueShopping}>
          Continue shopping
        </Button>
        <p className={styles.footnote}>
          Track this order any time from Account → Orders.
        </p>
      </div>
    </div>
  );
}
