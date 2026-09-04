"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Field, TextArea } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
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
  // The parcel whose call-off reason is being typed. Inline rather than
  // `window.prompt`: the prompt cannot say what the reason is for, and a
  // cancellation here is recorded on somebody's order.
  const [callingOff, setCallingOff] = useState<string | null>(null);
  const [reason, setReason] = useState("");

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
      setCallingOff(null);
      setReason("");
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Despatch"
        subtitle="Courier parcels. A parcel that could not be booked is a paid order with no rider."
      />

      <Toolbar>
        <SegmentedFilter
          label="Filter parcels"
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setRows(null);
          }}
          options={FILTERS}
        />
      </Toolbar>

      {/* `aria-live` so a refusal is announced, not just drawn (M36). */}
      <div aria-live="polite">{error ? <Notice tone="danger">{error}</Notice> : null}</div>

      {rows === null ? (
        <LoadingRows rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing here."
          body="Every parcel in this state is accounted for. A parcel lands in the queue when a kitchen marks an order packed."
        />
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

                  {callingOff === row.id ? (
                    <div className={styles.reasonBox}>
                      <Field
                        label="Why is this parcel being called off?"
                        hint="Recorded on the parcel. The order itself is untouched — cancel or refund it from the order's own page."
                      >
                        <TextArea
                          rows={2}
                          autoFocus
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="e.g. Kitchen will hand it over themselves."
                        />
                      </Field>
                      <div className={styles.actions}>
                        <Button
                          size="sm"
                          disabled={busy === row.id || reason.trim().length < 3}
                          onClick={() => act(row.id, () => cancelConsignment(row.id, reason.trim()))}
                        >
                          {busy === row.id ? "Calling off…" : "Call off parcel"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy === row.id}
                          onClick={() => {
                            setCallingOff(null);
                            setReason("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {callingOff !== row.id ? (
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
                          setCallingOff(row.id);
                          setReason("");
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Call off
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
