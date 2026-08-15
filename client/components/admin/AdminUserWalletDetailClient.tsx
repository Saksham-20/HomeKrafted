"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TransactionRow } from "@/components/ui/TransactionRow";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { adjustWallet, getUserById, issueRefund, getUserWallet, type AdminUserWallet } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/format";
import type { User, WalletTransaction } from "@/lib/types";
import styles from "./AdminUserWalletDetailClient.module.css";

export interface AdminUserWalletDetailClientProps {
  userId: string;
}

/**
 * `/admin/wallet/[userId]` (M11b) — one account's wallet balance +
 * ledger, plus the two write actions: **issue a refund** (`category:
 * "refund"`, credit — same ledger shape as the consumer `WalletContext.refund`)
 * and **manual adjustment** (credit/debit with a reason, `category:
 * "adjustment"`). Both prepend a real `WalletTransaction` to this user's
 * ledger via `lib/api/admin.ts#issueRefund`/`adjustWallet` and update the
 * balance shown here immediately.
 */
export function AdminUserWalletDetailClient({ userId }: AdminUserWalletDetailClientProps) {
  const { ready, role } = useAuth();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [data, setData] = useState<AdminUserWallet | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">("credit");
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [lastAction, setLastAction] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [foundUser, wallet] = await Promise.all([getUserById(userId), getUserWallet(userId)]);
      if (cancelled) return;
      setUser(foundUser ?? null);
      setData(wallet);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, userId]);

  function prependTxn(txn: WalletTransaction) {
    setData((current) =>
      current
        ? {
            ...current,
            wallet: { ...current.wallet, balance: txn.balanceAfter },
            transactions: [txn, ...current.transactions],
          }
        : current,
    );
  }

  /**
   * Appends the next ledger page. The ledger is cursor-paged, so an admin
   * looking into a dispute can still read back through it — before this it
   * arrived whole, which worked only because no wallet was large yet.
   */
  async function loadMoreTransactions() {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLedgerError(undefined);
    try {
      const next = await getUserWallet(userId, data.nextCursor);
      if (!next) return;
      setData((current) =>
        current
          ? {
              ...current,
              transactions: [
                ...current.transactions,
                // A slow network plus an impatient second click is how
                // duplicate React keys happen.
                ...next.transactions.filter(
                  (row) => !current.transactions.some((seen) => seen.id === row.id),
                ),
              ],
              nextCursor: next.nextCursor,
            }
          : current,
      );
    } catch {
      // Without this the button simply un-greys and the ledger stops
      // where it stopped — which on a dispute screen reads as "that is
      // the whole history", the one wrong conclusion this page can lead
      // an admin to.
      setLedgerError("Couldn't load older transactions. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleIssueRefund() {
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) {
      setFormError("Enter a refund amount greater than 0.");
      return;
    }
    setFormError(undefined);
    setSaving(true);
    // `issueRefund` stopped swallowing its refusals in M36, and this is
    // the screen where that mattered most: without a catch, a rejected
    // refund skipped `setSaving(false)` too, so the button sat on its
    // busy state with no message. On a money screen an admin reads that
    // as "still working", waits, reloads, and tries again — which is how
    // one refund becomes three.
    try {
      const txn = await issueRefund({
        userId,
        amount,
        title: refundReason.trim() || "Admin-issued refund",
        refType: "order",
      });
      if (!txn) {
        setFormError("Couldn't issue that refund.");
        return;
      }
      prependTxn(txn);
      setRefundAmount("");
      setRefundReason("");
      setLastAction(`Refund of ${formatCurrency(amount)} issued.`);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Couldn't issue that refund."));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    const amount = Number(adjustAmount);
    if (!amount || amount <= 0) {
      setFormError("Enter an adjustment amount greater than 0.");
      return;
    }
    if (!adjustReason.trim()) {
      setFormError("Add a reason for this adjustment.");
      return;
    }
    setFormError(undefined);
    setSaving(true);
    const txn = await adjustWallet({ userId, amount, direction: adjustDirection, reason: adjustReason.trim() });
    setSaving(false);
    if (!txn) {
      setFormError(
        adjustDirection === "debit"
          ? "That debit would take the balance below zero."
          : "Couldn't make that adjustment.",
      );
      return;
    }
    prependTxn(txn);
    setAdjustAmount("");
    setAdjustReason("");
    setLastAction(`${adjustDirection === "credit" ? "Credited" : "Debited"} ${formatCurrency(amount)}.`);
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading wallet…</div>;
  }

  if (user === null || !data) {
    return (
      <div>
        <Link href="/admin/wallet" className={styles.back}>
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          Back to wallet
        </Link>
        <Card className={styles.notFound}>No wallet found for this user.</Card>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/wallet" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to wallet
      </Link>

      <AdminPageHeader title={user?.name ?? "User"} subtitle={user?.email ?? user?.phone ?? data.wallet.userId} />

      <div className={styles.statGrid}>
        <StatCard label="Balance" value={formatCurrency(data.wallet.balance)} />
        <StatCard label="Pending cashback" value={formatCurrency(data.wallet.pendingCashback)} />
        <StatCard label="Lifetime saved" value={formatCurrency(data.wallet.lifetimeSaved)} />
      </div>

      <div className={styles.formsGrid}>
        <Card className={styles.formCard}>
          <span className={styles.cardTitle}>Issue refund</span>
          <p className={styles.hint}>Credits the wallet with a `category: &quot;refund&quot;` ledger entry.</p>
          <label className={styles.field}>
            <span className={styles.label}>Amount (₹)</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              placeholder="e.g. 250"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Reason / reference (optional)</span>
            <input
              className={styles.input}
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="e.g. Refund — Order #HK2043 (cancelled)"
            />
          </label>
          <Button variant="primary" size="sm" onClick={handleIssueRefund} disabled={saving}>
            {saving ? "Processing…" : "Issue refund"}
          </Button>
        </Card>

        <Card className={styles.formCard}>
          <span className={styles.cardTitle}>Manual adjustment</span>
          <p className={styles.hint}>Credit or debit with a reason, `category: &quot;adjustment&quot;`.</p>
          <div className={styles.directionRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="adjustDirection"
                checked={adjustDirection === "credit"}
                onChange={() => setAdjustDirection("credit")}
              />
              Credit
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="adjustDirection"
                checked={adjustDirection === "debit"}
                onChange={() => setAdjustDirection("debit")}
              />
              Debit
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Amount (₹)</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              placeholder="e.g. 100"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Reason</span>
            <input
              className={styles.input}
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              placeholder="e.g. Goodwill credit — support case #4821"
            />
          </label>
          <Button variant="primary" size="sm" onClick={handleAdjust} disabled={saving}>
            {saving ? "Processing…" : "Apply adjustment"}
          </Button>
        </Card>
      </div>

      {formError && <p className={styles.error}>{formError}</p>}
      {lastAction && !formError && <p className={styles.success}>{lastAction}</p>}

      <h2 className={styles.sectionTitle}>Ledger</h2>
      <Card className={styles.ledgerCard}>
        {data.transactions.length === 0 ? (
          <p className={styles.hint}>No transactions yet.</p>
        ) : (
          <>
            {data.transactions.map((txn) => (
              <TransactionRow key={txn.id} transaction={txn} />
            ))}
            {/* The ledger arrives one page at a time, so what is on screen
                is not necessarily all of it — offering the rest beats
                letting a partial history read as a complete one. */}
            {ledgerError && (
              <p className={styles.ledgerError} role="alert">
                {ledgerError}
              </p>
            )}
            {data.nextCursor && (
              <Button
                variant="secondary"
                className={styles.loadMore}
                disabled={loadingMore}
                onClick={loadMoreTransactions}
              >
                {loadingMore ? "Loading…" : "Load older transactions"}
              </Button>
            )}
          </>
        )}
      </Card>

      <p className={styles.footnote}>
        A real, server-authoritative wallet ledger. Every write is
        audit-logged — who issued it, when, and against which order — and
        no balance is ever written directly: adjustments and refunds go
        through the same row-locked ledger primitives a purchase does.
      </p>
    </div>
  );
}
