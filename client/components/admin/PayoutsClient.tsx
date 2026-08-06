"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getAdminPayouts,
  markPayoutPaid,
  rejectPayout,
  type AdminPayout,
  type AdminPayoutQueue,
} from "@/lib/api";
import { ApiError } from "@/lib/api/http";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PayoutStatus } from "@/lib/types";
import styles from "./PayoutsClient.module.css";

type Filter = "all" | PayoutStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Declined" },
];

/**
 * `/admin/payouts` (M15) — the queue that makes HomeKrafter earnings
 * payable.
 *
 * A HomeKrafter could request a payout from M8.3b onward and nothing on
 * the platform could act on it: no endpoint, no screen, no transition out
 * of `pending`. Money went into the marketplace and had no way out.
 *
 * **Marking paid records a settlement, it doesn't perform one.** There is
 * no payout-provider integration — an admin transfers out of band and
 * puts the bank reference here, which is the only link between this row
 * and a real transfer. The form says so rather than implying the button
 * moves money.
 */
export function PayoutsClient() {
  const { ready, role } = useAuth();
  const [queue, setQueue] = useState<AdminPayoutQueue | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"pay" | "reject">("pay");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    getAdminPayouts().then((data) => {
      if (!cancelled) setQueue(data);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  function closeForm() {
    setOpenId(null);
    setReference("");
    setNote("");
    setError(null);
  }

  function applyUpdate(updated: AdminPayout) {
    setQueue((current) =>
      current
        ? {
            items: current.items.map((row) => (row.id === updated.id ? updated : row)),
            summary: {
              pendingCount: current.summary.pendingCount - 1,
              pendingTotal: current.summary.pendingTotal - updated.amount,
              paidTotal:
                updated.status === "paid"
                  ? current.summary.paidTotal + updated.amount
                  : current.summary.paidTotal,
            },
          }
        : current,
    );
  }

  async function submit(payout: AdminPayout) {
    setBusy(true);
    setError(null);
    try {
      const updated =
        mode === "pay"
          ? await markPayoutPaid(payout.id, reference.trim() || undefined, note.trim() || undefined)
          : await rejectPayout(payout.id, note.trim());
      applyUpdate(updated);
      closeForm();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Couldn't record that. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !queue) {
    return <div className={styles.loading}>Loading payouts…</div>;
  }

  const visible = queue.items.filter((row) => filter === "all" || row.status === filter);

  return (
    <div>
      <AdminPageHeader
        title="Payouts"
        subtitle="HomeKrafter earnings requests. Marking one paid records a transfer you've already made — it doesn't send money."
      />

      {/*
        WS0b. `commissionPct` (default 10) exists only as a modelled number
        on the admin analytics screen — **nothing deducts it**. Every figure
        below is the full order value, so an admin transferring "the payout
        amount" hands over the platform's cut too.

        This sits above the queue rather than in `LAUNCH-READINESS.md` alone
        because that file is read once and this decision is made every time
        somebody settles a row. The plan deliberately does not implement a
        take rate — that is a business call, not a bug fix — so until one
        exists the honest thing is to say so where the money moves.
      */}
      <Card padding="md" className={styles.grossNotice}>
        <strong>These amounts are gross.</strong> No commission is deducted
        anywhere on the platform yet, so each figure is the full order value
        owed to the HomeKrafter. If a cut is meant to be taken, take it
        before transferring — see{" "}
        <code>docs/LAUNCH-READINESS.md</code> §3b.
      </Card>

      <div className={styles.statGrid}>
        <StatCard
          label="Awaiting settlement"
          value={formatCurrency(queue.summary.pendingTotal)}
          hint={`${queue.summary.pendingCount} request${queue.summary.pendingCount === 1 ? "" : "s"}`}
        />
        <StatCard label="Settled to date" value={formatCurrency(queue.summary.paidTotal)} />
        <StatCard label="Requests" value={String(queue.items.length)} />
      </div>

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onClick={() => setFilter(f.value)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <Card padding="lg" className={styles.empty}>
          {filter === "pending"
            ? "Nothing waiting — every request has been settled or declined."
            : "No payouts here."}
        </Card>
      ) : (
        <div className={styles.list}>
          {visible.map((payout) => (
            <Card key={payout.id} padding="md" className={styles.row}>
              <div className={styles.head}>
                <div className={styles.body}>
                  <span className={styles.name}>{payout.vendorName}</span>
                  <span className={styles.meta}>
                    {payout.sellerName} · {payout.periodStart} → {payout.periodEnd}
                    {payout.sellerEmail ? ` · ${payout.sellerEmail}` : ""}
                  </span>
                </div>
                <div className={styles.amountCol}>
                  <span className={styles.amount}>{formatCurrency(payout.amount)}</span>
                  <StatusPill status={payout.status} />
                </div>
              </div>

              {payout.status === "pending" ? (
                openId === payout.id ? (
                  <div className={styles.form}>
                    {mode === "pay" ? (
                      <label className={styles.field}>
                        <span className={styles.label}>Bank / UPI reference</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={reference}
                          maxLength={120}
                          onChange={(event) => setReference(event.target.value)}
                          placeholder="UTR or transaction id"
                        />
                        <span className={styles.hint}>
                          The only link between this row and the real transfer. Leave blank only
                          if it isn&apos;t back yet.
                        </span>
                      </label>
                    ) : null}

                    <Textarea
                      label={mode === "pay" ? "Note (optional)" : "Why is this declined?"}
                      value={note}
                      rows={2}
                      maxLength={500}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={
                        mode === "pay"
                          ? "NEFT sent 12:40"
                          : "Bank details don't match the registered name — please update and re-request."
                      }
                      hint={
                        mode === "reject"
                          ? "The HomeKrafter sees this. Say what they need to fix."
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
                        onClick={() => submit(payout)}
                        disabled={busy || (mode === "reject" && note.trim().length < 5)}
                      >
                        {busy
                          ? "Saving…"
                          : mode === "pay"
                            ? "Record as paid"
                            : "Decline request"}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={closeForm} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <Button
                      size="sm"
                      onClick={() => {
                        setMode("pay");
                        setOpenId(payout.id);
                      }}
                    >
                      Mark paid
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMode("reject");
                        setOpenId(payout.id);
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                )
              ) : (
                <div className={styles.decision}>
                  {payout.reference ? (
                    <span className={styles.reference}>Ref {payout.reference}</span>
                  ) : null}
                  {payout.note ? <span className={styles.note}>{payout.note}</span> : null}
                  {payout.decidedByName && payout.decidedAt ? (
                    <span className={styles.decidedBy}>
                      {payout.decidedByName} · {formatDate(payout.decidedAt)}
                    </span>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
