"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/cart/CartContext";
import { apiErrorMessage, reorder, type ReorderResult } from "@/lib/api";
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
 *
 * Three things this got wrong until 2026-09-06, all found while porting
 * it to the native app:
 *
 * 1. **`refresh()` sat inside the same `try` as `reorder()`.** The server
 *    has already committed the cart writes by then, so a failed cart
 *    re-pull was reported as a failed *reorder* — and pressing again
 *    **merges** quantities into the existing lines server-side
 *    (`orders.service.ts:345`, `wanted = existing.quantity + item.quantity`),
 *    so the cart silently doubled. It is the "claim a state the server has
 *    not confirmed" rule inverted: claiming failure over a confirmed
 *    success is the more expensive direction.
 * 2. **A bare `catch` discarded the server's own sentence.**
 *    `apiErrorMessage` exists for exactly this and the sibling panel in
 *    the same card stack already uses it.
 * 3. **`{ added: [], skipped: [] }` produced nothing observable.**
 *    Navigation is gated on `added.length > 0` and the report on
 *    `skipped.length > 0`, so that result fell through both — and it is
 *    not hypothetical: it is what mock mode returns unconditionally, so
 *    on the local dev server the button was guaranteed to do nothing.
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
    setResult(null);

    let outcome: ReorderResult;
    try {
      outcome = await reorder(orderId);
    } catch (err) {
      // The server's own sentence, not a generic one — a 404 here says
      // "Order not found", which is worth reading.
      setError(apiErrorMessage(err, "Couldn't rebuild that order. Try again in a moment."));
      setBusy(false);
      return;
    }

    // Past this line the cart writes are committed. Everything below is
    // reporting a success, so nothing below may present itself as a
    // failed reorder — pressing again would merge quantities into the
    // lines that are already there.
    setResult(outcome);

    try {
      await refresh();
    } catch {
      // The cart genuinely changed and we could not re-read it. Say that,
      // rather than "couldn't rebuild that order" over an order that was
      // rebuilt — and do not navigate to a cart we would render stale.
      setError("Your cart was updated, but we couldn't re-read it. Open the cart to see it.");
      setBusy(false);
      return;
    }

    if (outcome.added.length > 0 && outcome.skipped.length === 0) {
      router.push("/cart");
    }
    setBusy(false);
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

      {/* Rendered whenever anything is left to say. A clean reorder has
          already navigated to the cart, so what reaches here is a partial
          success or — the case that used to fall through both gates and
          leave the button looking dead — a result with nothing in either
          list. */}
      {result && (result.skipped.length > 0 || result.added.length === 0) ? (
        <div className={styles.report} role="status">
          {result.added.length > 0 ? (
            <p className={styles.reportLine}>
              Added {result.added.length} item{result.added.length === 1 ? "" : "s"} to your
              cart.
            </p>
          ) : (
            <p className={styles.reportLine}>
              {result.skipped.length > 0
                ? "Nothing from this order could be added."
                : "Nothing from this order is available right now."}
            </p>
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
