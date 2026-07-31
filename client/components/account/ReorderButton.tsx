"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/cart/CartContext";
import { reorder, type ReorderResult } from "@/lib/api";
import styles from "./ReorderButton.module.css";

export interface ReorderButtonProps {
  orderId: string;
  className?: string;
}

/**
 * "Order this again" (M15). Reorder existed only as a line of marketing
 * copy on `/app-promo` promising it as an app feature; the web had no
 * such thing.
 *
 * The add happens server-side (`POST /orders/:id/reorder`) because each
 * line has to be re-checked against today's catalogue — home kitchens
 * pause items, sell out, and retire weights. That means the cart changed
 * behind this store's back, so `refresh()` re-pulls it before we send
 * anyone to `/cart`.
 *
 * Partial success is normal and is **reported, not hidden**: dropping
 * half an order silently is the failure mode worth avoiding here.
 */
export function ReorderButton({ orderId, className }: ReorderButtonProps) {
  const router = useRouter();
  const { refresh } = useCart();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await reorder(orderId);
      await refresh();
      setResult(outcome);
      if (outcome.added.length > 0 && outcome.skipped.length === 0) {
        router.push("/cart");
      }
    } catch {
      setError("Couldn't rebuild that order. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button variant="secondary" onClick={handleClick} disabled={busy}>
        {busy ? "Adding…" : "Order this again"}
      </Button>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {/* Only rendered when something was skipped — a clean reorder has
          already navigated to the cart by this point. */}
      {result && result.skipped.length > 0 ? (
        <div className={styles.report} role="status">
          {result.added.length > 0 ? (
            <p className={styles.reportLine}>
              Added {result.added.length} item{result.added.length === 1 ? "" : "s"} to your
              cart.
            </p>
          ) : (
            <p className={styles.reportLine}>Nothing from this order could be added.</p>
          )}
          <ul className={styles.skipped}>
            {result.skipped.map((item) => (
              <li key={item.name}>
                <span className={styles.skippedName}>{item.name}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
