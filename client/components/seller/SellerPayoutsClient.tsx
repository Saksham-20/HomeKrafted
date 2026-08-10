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
  getSellerEarningsSummary,
  getSellerPayouts,
  requestSellerPayout,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { Payout } from "@/lib/types";
import styles from "./SellerPayoutsClient.module.css";

interface Summary {
  totalPaid: number;
  totalPending: number;
  lifetimeEarned: number;
}

/** `/seller/payouts` (M10a) — earnings summary, a mock "request payout" action, and full `Payout` history. */
export function SellerPayoutsClient() {
  const { ready, seller } = useAuth();
  const [summary, setSummary] = useState<Summary | undefined>(undefined);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!seller) return;
    const [s, list] = await Promise.all([
      getSellerEarningsSummary(seller.id),
      getSellerPayouts(seller.id),
    ]);
    setSummary(s);
    setPayouts(list);
  }, [seller]);

  useEffect(() => {
    if (!ready || !seller) return;
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [ready, seller, refresh]);

  async function handleRequest() {
    if (!seller) return;
    setRequesting(true);
    setError(null);
    try {
      await requestSellerPayout(seller.id, summary?.totalPending ?? 0);
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

  if (!ready || loading || !summary) {
    return <div className={styles.loading}>Loading your payouts…</div>;
  }

  return (
    <div>
      <SellerPageHeader title="Payouts" subtitle="Your earnings and settlement history." />

      <div className={styles.summaryGrid}>
        <StatCard label="Lifetime earned" value={formatCurrency(summary.lifetimeEarned)} />
        <StatCard label="Paid out" value={formatCurrency(summary.totalPaid)} />
        <StatCard label="Pending" value={formatCurrency(summary.totalPending)} />
      </div>

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
        <p className={styles.requestHint}>
          {summary.totalPending > 0
            ? `Your whole pending balance of ${formatCurrency(summary.totalPending)} goes out in one settlement. Payouts are settled by hand, so allow a couple of working days.`
            : "You have nothing pending right now. New earnings appear here as orders are delivered."}
        </p>
        <div className={styles.requestRow}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRequest}
            disabled={requesting || summary.totalPending <= 0}
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
      {payouts.length === 0 ? (
        <EmptyState
          title="No payouts yet."
          body="Earnings become payable once an order is delivered, and settle from there. Nothing is needed from you — this fills in as orders complete."
        />
      ) : (
        <Card className={styles.history} padding="md">
          {payouts.map((payout) => (
            <PayoutRow key={payout.id} payout={payout} />
          ))}
        </Card>
      )}
    </div>
  );
}
