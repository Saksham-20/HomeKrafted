"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TransactionRow } from "@/components/ui/TransactionRow";
import { ChoiceCards } from "@/components/portal/ChoiceCards";
import { Field, Input } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
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
  const [refundError, setRefundError] = useState<string | undefined>(undefined);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">("credit");
  const [adjustError, setAdjustError] = useState<string | undefined>(undefined);
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
      setRefundError("Enter a refund amount greater than 0.");
      return;
    }
    setRefundError(undefined);
    setLastAction(undefined);
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
        setRefundError("Couldn't issue that refund.");
        return;
      }
      prependTxn(txn);
      setRefundAmount("");
      setRefundReason("");
      setLastAction(`Refund of ${formatCurrency(amount)} issued.`);
    } catch (err) {
      setRefundError(apiErrorMessage(err, "Couldn't issue that refund."));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    const amount = Number(adjustAmount);
    if (!amount || amount <= 0) {
      setAdjustError("Enter an adjustment amount greater than 0.");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError("Add a reason for this adjustment.");
      return;
    }
    setAdjustError(undefined);
    setLastAction(undefined);
    setSaving(true);
    try {
      const txn = await adjustWallet({ userId, amount, direction: adjustDirection, reason: adjustReason.trim() });
      // `adjustWallet` answers `undefined` for exactly one refusal — an
      // insufficient balance (a 402) — and throws for everything else.
      if (!txn) {
        setAdjustError(
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
    } catch (err) {
      setAdjustError(apiErrorMessage(err, "Couldn't make that adjustment."));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return (
      <div>
        <AdminPageHeader title="Wallet" back={{ href: "/admin/wallet", label: "Wallet" }} />
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (user === null || !data) {
    return (
      <div>
        <AdminPageHeader title="Wallet" back={{ href: "/admin/wallet", label: "Wallet" }} />
        <Card className={styles.notFound}>No wallet found for this user.</Card>
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/wallet", label: "Wallet" }}
        eyebrow="Wallet"
        title={user?.name ?? "User"}
        subtitle={user?.email ?? user?.phone ?? data.wallet.userId}
        actions={
          user ? (
            <Link href={`/admin/users/${user.id}`} className={styles.linkButton}>
              Open account
            </Link>
          ) : undefined
        }
      />

      <div className={styles.statGrid}>
        <StatCard label="Balance" value={formatCurrency(data.wallet.balance)} />
        <StatCard label="Pending cashback" value={formatCurrency(data.wallet.pendingCashback)} />
        <StatCard label="Lifetime saved" value={formatCurrency(data.wallet.lifetimeSaved)} />
      </div>

      {lastAction && (
        <Notice tone="success" live onDismiss={() => setLastAction(undefined)}>
          {lastAction}
        </Notice>
      )}

      <div className={styles.formsGrid}>
        <FormSection
          id="wallet-refund"
          title="Issue a refund"
          description="Credits their wallet and records a refund entry. To refund an order, use the order's own page instead — it marks the order refunded so it cannot be refunded twice."
          footer={
            <Button variant="primary" size="sm" onClick={handleIssueRefund} disabled={saving}>
              {saving ? "Processing…" : "Issue refund"}
            </Button>
          }
        >
          <Field label="Amount" error={refundError}>
            <Input
              type="number"
              min={1}
              inputMode="decimal"
              affixStart="₹"
              value={refundAmount}
              onChange={(event) => {
                setRefundAmount(event.target.value);
                setRefundError(undefined);
              }}
              placeholder="250"
            />
          </Field>
          <Field label="Reason or reference" optional hint="Shown on the ledger entry the customer sees.">
            <Input
              value={refundReason}
              maxLength={120}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="Refund — order HK2043 (cancelled)"
            />
          </Field>
        </FormSection>

        <FormSection
          id="wallet-adjust"
          title="Manual adjustment"
          description="A credit or debit that is not an order refund — goodwill, a correction, a support case. The reason is recorded against the entry."
          footer={
            <Button variant="primary" size="sm" onClick={handleAdjust} disabled={saving}>
              {saving ? "Processing…" : adjustDirection === "credit" ? "Credit wallet" : "Debit wallet"}
            </Button>
          }
        >
          <ChoiceCards
            label="Direction"
            columns={2}
            value={adjustDirection}
            onChange={(next) => {
              setAdjustDirection(next);
              setAdjustError(undefined);
            }}
            options={[
              { value: "credit", title: "Credit", hint: "Adds money to their wallet." },
              { value: "debit", title: "Debit", hint: "Takes money out. Refused if it would go below zero." },
            ]}
          />
          <Field label="Amount" error={adjustError && adjustError.includes("amount") ? adjustError : undefined}>
            <Input
              type="number"
              min={1}
              inputMode="decimal"
              affixStart="₹"
              value={adjustAmount}
              onChange={(event) => {
                setAdjustAmount(event.target.value);
                setAdjustError(undefined);
              }}
              placeholder="100"
            />
          </Field>
          <Field
            label="Reason"
            error={adjustError && !adjustError.includes("amount") ? adjustError : undefined}
          >
            <Input
              value={adjustReason}
              maxLength={200}
              onChange={(event) => {
                setAdjustReason(event.target.value);
                setAdjustError(undefined);
              }}
              placeholder="Goodwill credit — support case #4821"
            />
          </Field>
        </FormSection>
      </div>

      <FormSection
        id="wallet-ledger"
        title="Ledger"
        description="Every entry, newest first. Nothing writes a balance directly — every line here went through the same row-locked ledger a purchase does, and every admin write is audited."
      >
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
      </FormSection>
    </div>
  );
}
