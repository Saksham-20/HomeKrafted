"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { StatCard } from "./StatCard";
import { PayoutRow } from "./PayoutRow";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getSellerPayoutsPage,
  requestSellerPayout,
  type SellerPayoutsPage,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import styles from "./SellerPayoutsClient.module.css";

/** `/seller/payouts` (M10a) — earnings summary, a mock "request payout" action, and full `Payout` history. */
export function SellerPayoutsClient() {
  const { seller, sellerDataReady } = useAuth();
  const [page, setPage] = useState<SellerPayoutsPage | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!seller) return;
    setPage(await getSellerPayoutsPage(seller.id));
  }, [seller]);

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  useEffect(() => {
    if (!sellerDataReady) return;
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [sellerDataReady, refresh]);

  async function handleRequest() {
    if (!seller) return;
    setRequesting(true);
    setError(null);
    try {
      await requestSellerPayout(seller.id, page?.pendingBalance ?? 0);
      await refresh();
      setRequested(true);
      setTimeout(() => setRequested(false), 2500);
    } catch (err) {
      // `POST /seller/payouts/request` refuses a second request while one
      // is already pending (409) — which, on this very screen, is the
      // normal state. With no catch the button sat on "Requesting…"
      // forever and said nothing, on the screen a HomeKrafter uses to ask
      // for their money.
      setError(apiErrorMessage(err, "Couldn't request a payout. Try again."));
    } finally {
      setRequesting(false);
    }
  }

  if (!sellerDataReady || loading || !page) {
    return <div className={styles.loading}>Loading your payouts…</div>;
  }

  const summary = page.summary;
  const commission = page.commission;
  const payable = page.pendingBalance;

  return (
    <div>
      <SellerPageHeader title="Payouts" subtitle="Your earnings and settlement history." />

      <div className={styles.summaryGrid}>
        <StatCard label="Lifetime earned" value={formatCurrency(summary.lifetimeEarned)} />
        <StatCard label="Paid out" value={formatCurrency(summary.totalPaid)} />
        <StatCard label="Requested, awaiting settlement" value={formatCurrency(summary.totalPending)} />
      </div>

      {/*
        The M37 transparency card: what a payout of today's unclaimed
        earnings works out to, at the platform rate. While the commission
        switch is off nothing is deducted and these are estimates — the
        card says so out loud, because /terms promises the split is shown
        before it is ever taken.
      */}
      {commission.grossPending > 0 && (
        <Card className={styles.requestCard}>
          <h2 className={styles.sectionTitle}>How your next payout breaks down</h2>
          <p className={styles.requestHint}>
            Earnings not yet requested: <strong>{formatCurrency(commission.grossPending)}</strong>
            {" · "}platform commission at {commission.pct}%:{" "}
            <strong>{formatCurrency(commission.commissionOnPending)}</strong>
            {" · "}you receive: <strong>{formatCurrency(commission.netPending)}</strong>
          </p>
          <p className={styles.requestHint}>
            {commission.enabled
              ? "Commission is deducted when you request a payout, and every payout below shows its own split."
              : "This is an estimate — nothing is deducted yet. Payouts are currently settled at the full amount."}
          </p>
        </Card>
      )}

      {/*
        There is no amount field any more, and there never should have
        been one. `POST /seller/payouts/request` takes no amount — the
        server computes the whole pending balance itself — so the input
        was collected, validated as "greater than zero", and then thrown
        away: a HomeKrafter with ₹6,210 pending could type 1,000, press
        the button, and get a request for ₹6,210. On a money screen, a
        field that does nothing is worse than no field.
      */}
      <Card className={styles.requestCard}>
        <h2 className={styles.sectionTitle}>Request a payout</h2>
        {/*
          Gated on `pendingBalance` — the server-computed unclaimed
          earnings — not `summary.totalPending`, which is money already
          requested and awaiting settlement. Gating on the latter meant a
          kitchen whose last request had been paid saw a dead button over
          fresh delivered earnings (found in the M37 commission pass).
        */}
        <p className={styles.requestHint}>
          {payable > 0
            ? `Your whole unclaimed balance of ${formatCurrency(payable)} goes out in one settlement. Payouts are settled by hand, so allow a couple of working days.`
            : "You have nothing to request right now. New earnings appear here as orders are delivered."}
        </p>
        <div className={styles.requestRow}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRequest}
            disabled={requesting || payable <= 0}
          >
            {requesting ? "Requesting…" : "Request payout"}
          </Button>
          {requested && <span className={styles.requestedNote}>Requested — added to pending.</span>}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </Card>

      <h2 className={styles.sectionTitle}>History</h2>
      {page.items.length === 0 ? (
        <EmptyState
          title="No payouts yet."
          body="Earnings become payable once an order is delivered, and settle from there. Nothing is needed from you — this fills in as orders complete."
        />
      ) : (
        <Card className={styles.history} padding="md">
          {page.items.map((payout) => (
            <PayoutRow key={payout.id} payout={payout} />
          ))}
        </Card>
      )}
    </div>
  );
}
