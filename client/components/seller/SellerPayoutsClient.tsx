"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "./StatCard";
import { PayoutRow } from "./PayoutRow";
import { SellerPageHeader } from "./SellerPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerEarningsSummary, getSellerPayouts, requestSellerPayout } from "@/lib/api";
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
  const [amount, setAmount] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

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
    const value = Number(amount);
    if (!value || value <= 0) return;
    setRequesting(true);
    await requestSellerPayout(seller.id, value);
    await refresh();
    setRequesting(false);
    setAmount("");
    setRequested(true);
    setTimeout(() => setRequested(false), 2500);
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

      <Card className={styles.requestCard}>
        <h2 className={styles.sectionTitle}>Request a payout</h2>
        <div className={styles.requestRow}>
          <input
            type="number"
            min={1}
            className={styles.amountInput}
            placeholder="Amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Payout amount"
          />
          <Button variant="primary" size="sm" onClick={handleRequest} disabled={requesting || !amount}>
            {requesting ? "Requesting…" : "Request payout"}
          </Button>
          {requested && <span className={styles.requestedNote}>Requested — added to pending.</span>}
        </div>
      </Card>

      <h2 className={styles.sectionTitle}>History</h2>
      {payouts.length === 0 ? (
        <Card className={styles.empty}>No payouts yet.</Card>
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
