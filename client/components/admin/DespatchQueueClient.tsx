"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api/http";
import {
  bookConsignment,
  cancelConsignment,
  listConsignmentsForAdmin,
  type AdminConsignment,
} from "@/lib/api/shipping";
import type { ConsignmentStatus } from "@/lib/types/shipping";
import styles from "./DespatchQueueClient.module.css";

/**
 * `/admin/shipping` — the despatch queue.
 *
 * The default filter is **`failed`**, not "all". A booked parcel needs
 * nobody; a parcel that could not be booked is a paid order with no rider
 * and is the only reason to open this screen. Everything else is one
 * click away.
 *
 * Copy here is plain (`lib/kitchen-copy.ts`'s rule): an operator is on
 * this page because something needs deciding, and whimsy over a queue
 * holding somebody's income reads as not taking the job seriously.
 */
const FILTERS: Array<{ label: string; value: ConsignmentStatus | "all" }> = [
  { label: "Not booked", value: "failed" },
  { label: "Awaiting pickup", value: "booked" },
  { label: "Delayed", value: "exception" },
  { label: "All", value: "all" },
];

export function DespatchQueueClient() {
  const [filter, setFilter] = useState<ConsignmentStatus | "all">("failed");
  const [rows, setRows] = useState<AdminConsignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Bumped to re-run the effect after an action, instead of calling a
  // shared loader — an effect that calls `setState` on a path the linter
  // can see as synchronous triggers cascading renders.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    listConsignmentsForAdmin(filter === "all" ? {} : { status: filter })
      .then((page) => {
        if (ignore) return;
        setRows(page.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setRows([]);
        // The server's own sentence, not a generic line — it is what says
        // what to do next (M36).
        setError(err instanceof ApiError ? err.message : "We could not load the despatch queue.");
      });
    return () => {
      ignore = true;
    };
  }, [filter, reloadToken]);

  /**
   * Both actions surface the server's own sentence. A carrier refusal
   * ("Invalid Pickup Pincode. Pickup pincode 160022 is not serviceable")
   * is the whole of what tells an operator what to fix, so it is shown
   * verbatim and never replaced with a generic failure line.
   */
  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h1 className={styles.title}>Despatch</h1>
        <p className={styles.sub}>Courier parcels. A parcel that could not be booked is a paid order with no rider.</p>
      </header>

      <div className={styles.filters} role="group" aria-label="Filter parcels">
        {FILTERS.map((f) => (
          <button
            className={styles.filter}
            data-active={filter === f.value ? "true" : undefined}
            key={f.value}
            onClick={() => setFilter(f.value)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* `aria-live` so a refusal is announced, not just drawn (M36). */}
      <div aria-live="polite" className={styles.live}>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>

      {rows === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : rows.length === 0 ? (
        <Card className={styles.emptyCard}>
          <p className={styles.empty}>Nothing here. Every parcel in this state is accounted for.</p>
        </Card>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id}>
              <Card className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.order}>
                    {row.order ? `Order ${row.order.orderNumber}` : row.clientOrderId}
                    <span className={styles.pill} data-status={row.status}>
                      {row.status.replace(/-/g, " ")}
                    </span>
                  </p>
                  {row.awbNumber ? <p className={styles.awb}>{row.awbNumber}</p> : null}
                  {row.failureReason ? (
                    // The carrier's own words. Never paraphrased.
                    <p className={styles.reason}>{row.failureReason}</p>
                  ) : null}
                  {row.statusNote && !row.failureReason ? <p className={styles.note}>{row.statusNote}</p> : null}
                  <p className={styles.meta}>
                    Created {formatDate(row.createdAt)}
                    {row.bookAttempts > 0 ? ` · ${row.bookAttempts} booking attempt${row.bookAttempts === 1 ? "" : "s"}` : ""}
                    {row.riderName ? ` · rider ${row.riderName}` : ""}
                  </p>
                </div>
                <div className={styles.actions}>
                  {!row.awbNumber && row.status !== "cancelled" ? (
                    <Button disabled={busy === row.id} onClick={() => act(row.id, () => bookConsignment(row.id))} size="sm">
                      {busy === row.id ? "Booking…" : "Book a rider"}
                    </Button>
                  ) : null}
                  {row.status !== "delivered" && row.status !== "cancelled" ? (
                    <Button
                      disabled={busy === row.id}
                      onClick={() => {
                        const reason = window.prompt("Why is this parcel being called off?")?.trim();
                        // A cancellation needs a reason and the server
                        // refuses one without it, so an empty prompt is a
                        // no-op rather than a request that 400s.
                        if (reason) void act(row.id, () => cancelConsignment(row.id, reason));
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      Call off
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
