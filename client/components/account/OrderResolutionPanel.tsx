"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { cancelOrder, requestReturn } from "@/lib/api";
import { ApiError } from "@/lib/api/http";
import { formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./OrderResolutionPanel.module.css";

export interface OrderResolutionPanelProps {
  order: Order;
  /** Called with the updated order so the detail screen can re-render around it. */
  onUpdated: (order: Order) => void;
}

/** Cancellation closes once the HomeKrafter starts packing — matches `OrdersService.CANCELLABLE`. */
const CANCELLABLE: readonly string[] = ["pending-payment", "placed", "confirmed"];
const RETURN_WINDOW_DAYS = 7;

/**
 * "Something's wrong with this order" — the buyer's side of cancellation
 * and returns (M15).
 *
 * `RefundStatus.requested` had been in the schema since M8 with no path
 * in the product that could reach it: a buyer whose order went wrong
 * could only open a support ticket which, until the same milestone, no
 * admin surface could read.
 *
 * Which control shows is decided by the order's own state, and the same
 * rules are enforced server-side — this only decides what to *offer*, and
 * the server has the final word (its refusal messages are shown verbatim).
 */
export function OrderResolutionPanel({ order, onUpdated }: OrderResolutionPanelProps) {
  const [mode, setMode] = useState<"idle" | "cancel" | "return">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = CANCELLABLE.includes(order.status);

  // "Is the return window still open" depends on the current time, which
  // makes it unsafe to compute during render — the house rule from M12's
  // React #418 (see CLAUDE.md: anything keyed on `new Date()` is
  // client-only, derived after mount behind a stable placeholder).
  // Starts closed so the control can only ever appear, never vanish.
  const [withinReturnWindow, setWithinReturnWindow] = useState(false);
  useEffect(() => {
    if (order.status !== "delivered") return;
    // Pre-M15 orders have no `deliveredAt`; `placedAt` is the only date
    // they carry, and it's the conservative fallback the server uses too.
    const from = new Date(order.deliveredAt ?? order.placedAt).getTime();
    const open = Date.now() - from <= RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (!open) return;
    // Deferred a tick rather than set straight from the effect body —
    // same pattern as `CartContext`/`WishlistContext`'s hydration effects
    // (`react-hooks/set-state-in-effect`).
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setWithinReturnWindow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [order.status, order.deliveredAt, order.placedAt]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const updated =
        mode === "cancel"
          ? await cancelOrder(order.id, reason.trim() || undefined)
          : await requestReturn(order.id, reason.trim());
      onUpdated(updated);
      setMode("idle");
      setReason("");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Couldn't send that. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Already resolved, or being looked at — state, not an action.
  if (order.refundStatus !== "none" || order.status === "cancelled") {
    return (
      <Card className={styles.statusCard}>
        <span className={styles.cardTitle}>
          {order.status === "cancelled"
            ? "Cancelled"
            : order.refundStatus === "refunded"
              ? "Refunded"
              : "Return requested"}
        </span>
        <p className={styles.statusBody}>
          {order.status === "cancelled" && order.refundStatus === "refunded"
            ? "This order was cancelled and the amount is back in your wallet."
            : order.refundStatus === "refunded"
              ? "The amount is back in your wallet."
              : order.refundStatus === "requested"
                ? "We've got your request and someone is looking at it. We'll be in touch."
                : "This refund is being processed."}
        </p>
        {order.refundReason ? (
          <p className={styles.reasonEcho}>
            <span className={styles.reasonLabel}>You told us:</span> {order.refundReason}
          </p>
        ) : null}
        {order.refundRequestedAt ? (
          <p className={styles.reasonMeta}>Requested {formatDate(order.refundRequestedAt)}</p>
        ) : null}
      </Card>
    );
  }

  if (!canCancel && !withinReturnWindow) {
    // Nothing to offer: too late to cancel, past the return window, or a
    // status where neither applies. Don't render an empty card.
    return null;
  }

  return (
    <Card className={styles.card}>
      <span className={styles.cardTitle}>Something wrong?</span>

      {mode === "idle" ? (
        <>
          <p className={styles.body}>
            {canCancel
              ? "You can still cancel this — nothing has been packed yet."
              : `Delivered orders can be returned within ${RETURN_WINDOW_DAYS} days.`}
          </p>
          <div className={styles.actions}>
            {canCancel ? (
              <Button variant="secondary" size="sm" onClick={() => setMode("cancel")}>
                Cancel this order
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setMode("return")}>
                Request a return
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <Textarea
            label={mode === "cancel" ? "Why? (optional)" : "What went wrong?"}
            value={reason}
            rows={3}
            maxLength={mode === "cancel" ? 500 : 1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              mode === "cancel"
                ? "Changed my mind"
                : "Tell us what happened — the more specific, the faster we can sort it."
            }
            hint={
              mode === "return"
                ? "At least a sentence. This goes to a person, and to the HomeKrafter."
                : undefined
            }
          />

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button
              size="sm"
              onClick={submit}
              disabled={busy || (mode === "return" && reason.trim().length < 10)}
            >
              {busy
                ? "Sending…"
                : mode === "cancel"
                  ? "Cancel the order"
                  : "Send return request"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              disabled={busy}
            >
              Never mind
            </Button>
          </div>

          {mode === "cancel" ? (
            <p className={styles.note}>
              Anything you paid goes straight back to your Homekrafted wallet.
            </p>
          ) : (
            <p className={styles.note}>
              A return request doesn&apos;t refund you automatically — someone reads it first.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
