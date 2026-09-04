"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getOrder, payOrder } from "@/lib/api/orders";
import { createRazorpayOrder } from "@/lib/api/wallet";
import { openRazorpayCheckout } from "@/lib/payments/razorpay";
import { apiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatCurrency } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./CompletePaymentPanel.module.css";

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "rzp_test_placeholder";

export interface CompletePaymentPanelProps {
  order: Order;
  /** Called with the re-read order once payment lands, so the screen re-renders around it. */
  onUpdated: (order: Order) => void;
}

/**
 * "This order still needs paying" — the way back into a payment that was
 * started and not finished (2026-09-04).
 *
 * **Every order is created before it is paid.** `OrdersService.create`
 * writes the row at `pending_payment` and **empties the cart in the same
 * transaction**, and only the Razorpay webhook (or `POST /orders/:id/pay`
 * for a wallet order) moves it to `placed`. So a buyer who closed the
 * Razorpay modal — dismissed it, lost the connection, closed the tab —
 * was left with an order nothing could pay and a cart that no longer held
 * their things. Checkout said "your order is saved and awaiting payment"
 * and there was no screen anywhere that could act on that sentence: the
 * client had **no call site for `payOrder` outside checkout at all**.
 * This is that screen.
 *
 * Nothing new is needed server-side, which is the point:
 * `POST /payments/razorpay/order` already reuses the live Razorpay order
 * for a `pending_payment` order rather than minting a second payable page
 * (the double-charge guard), and `POST /orders/:id/pay` is already
 * idempotent. This panel is the missing button, not a new money path.
 *
 * Two rules worth keeping:
 *
 * - **It renders only for `pending-payment`.** Any other status means the
 *   money question is settled, and a "pay" button beside a paid order is
 *   how somebody pays twice.
 * - **It re-reads the order from the server after the SDK reports
 *   success**, rather than assuming. The capture that actually places the
 *   order is the *webhook's*, and it may land a moment later — so a
 *   refetch that still says `pending-payment` is reported honestly
 *   ("we're confirming"), never painted as done.
 */
export function CompletePaymentPanel({ order, onUpdated }: CompletePaymentPanelProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (order.status !== "pending-payment") return null;

  async function settle() {
    // The webhook is what flips the row, and it can arrive a beat after
    // the SDK's callback. One re-read, reported as it comes back.
    const fresh = await getOrder(order.id);
    if (fresh) onUpdated(fresh);
    if (!fresh || fresh.status === "pending-payment") {
      setNote("Payment received — we're confirming it with the bank. This page will show it shortly.");
    } else {
      setNote(null);
    }
  }

  async function handlePay() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (order.paymentMethod === "wallet") {
        // Idempotent server-side, and keyed per order rather than per
        // click — a per-click key does nothing for the retry a timeout
        // provokes (the M26 rule).
        const paid = await payOrder(order.id, `order-pay-${order.id}`);
        onUpdated(paid);
        return;
      }

      const rzpOrder = await createRazorpayOrder({ purpose: "order", orderId: order.id });
      // A mock order id means this deployment has no usable keys. Opening
      // the SDK with one hangs forever with the page scroll-locked
      // (`PaymentsService.cardPaymentsEnabled`), so refuse instead.
      if (rzpOrder.mock) {
        setError("Card payments aren't available right now. Please try again later.");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        void openRazorpayCheckout({
          keyId: rzpOrder.keyId || RAZORPAY_KEY_ID,
          amountPaise: rzpOrder.amountPaise,
          currency: rzpOrder.currency,
          name: "Homekrafted",
          description: `Order #${order.orderNumber}`,
          orderId: rzpOrder.razorpayOrderId,
          prefill: { name: user?.name, email: user?.email ?? undefined, contact: user?.phone ?? undefined },
          onSuccess: () => resolve(),
          onDismiss: () => reject(new Error("DISMISSED")),
        }).catch(reject);
      });
      await settle();
    } catch (err) {
      if (err instanceof Error && err.message === "DISMISSED") {
        setNote("No payment was taken. Your order is still here whenever you want to finish.");
      } else {
        setError(apiErrorMessage(err, "That payment didn't go through. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={styles.card}>
      <div className={styles.body}>
        <span className={styles.title}>This order still needs paying</span>
        <p className={styles.copy}>
          Nothing has been charged and the maker hasn&rsquo;t started it yet. Your items are held on
          this order — finish paying and it goes straight to their kitchen.
        </p>
      </div>
      <div className={styles.actions}>
        <span className={styles.amount}>{formatCurrency(order.total)}</span>
        <Button variant="primary" size="sm" onClick={handlePay} disabled={busy}>
          {busy
            ? "Opening payment…"
            : order.paymentMethod === "wallet"
              ? "Pay from wallet"
              : "Complete payment"}
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="status" aria-live="polite">
          {error}
        </p>
      )}
      {note && !error && (
        <p className={styles.note} role="status" aria-live="polite">
          {note}
        </p>
      )}
    </Card>
  );
}
