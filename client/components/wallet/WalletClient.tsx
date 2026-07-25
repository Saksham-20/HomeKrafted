"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AmountPicker } from "@/components/ui/AmountPicker";
import { TransactionRow } from "@/components/ui/TransactionRow";
import { WalletBalanceCard } from "@/components/ui/WalletBalanceCard";
import { TOPUP_BONUS_RATE, TOPUP_BONUS_THRESHOLD, useWallet } from "@/lib/wallet/WalletContext";
import { formatCurrency, formatDate } from "@/lib/format";
import type { WalletTransaction } from "@/lib/types";
import styles from "./WalletClient.module.css";

export interface WalletClientProps {
  topupOptions: number[];
}

/** Rows shown before "View full history" is toggled — matches the prototype's 6-row sample list. */
const HISTORY_PREVIEW_COUNT = 6;

function groupByMonth(transactions: WalletTransaction[]): [string, WalletTransaction[]][] {
  const groups = new Map<string, WalletTransaction[]>();
  for (const txn of transactions) {
    const key = formatDate(txn.createdAt, { month: "long", year: "numeric" });
    const bucket = groups.get(key);
    if (bucket) bucket.push(txn);
    else groups.set(key, [txn]);
  }
  return Array.from(groups.entries());
}

/**
 * Wallet screen (M6) — ported from the prototype's `isWallet` block
 * (`handoff/prototype/Homekrafted.dc.html`): balance card, add-money
 * (amount picker + custom amount + top-up), pay-with-wallet info card,
 * transaction history with "View full history". Extends the prototype
 * with an auto-top-up rule editor (enable + threshold + amount) — the
 * prototype never shows one, but the plan's Wallet screen line item and
 * `AutoTopupRule` type (present since M0) both call for it; see
 * `CHANGELOG.md`'s M6 entry.
 */
export function WalletClient({ topupOptions }: WalletClientProps) {
  const {
    balance,
    pendingCashback,
    lifetimeSaved,
    transactions,
    autoTopup,
    ready,
    topUp,
    setAutoTopup,
  } = useWallet();

  const [selectedAmount, setSelectedAmount] = useState(topupOptions[0] ?? 500);
  const [customAmount, setCustomAmount] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showFullHistory, setShowFullHistory] = useState(false);

  const customValue = customAmount ? Number(customAmount) : undefined;
  const effectiveAmount = customValue !== undefined && customValue > 0 ? customValue : selectedAmount;
  const bonus =
    effectiveAmount > TOPUP_BONUS_THRESHOLD ? Math.round(effectiveAmount * TOPUP_BONUS_RATE) : 0;

  function handlePickAmount(amount: number) {
    setSelectedAmount(amount);
    setCustomAmount("");
  }

  function handleTopUp() {
    if (!effectiveAmount || effectiveAmount <= 0) return;
    topUp(effectiveAmount);
    setToast(
      bonus
        ? `Added ${formatCurrency(effectiveAmount)} + ${formatCurrency(bonus)} bonus to your wallet`
        : `Added ${formatCurrency(effectiveAmount)} to your wallet`,
    );
    setCustomAmount("");
    window.setTimeout(() => setToast(null), 3500);
  }

  const visibleTransactions = showFullHistory
    ? transactions
    : transactions.slice(0, HISTORY_PREVIEW_COUNT);
  const groupedTransactions = useMemo(
    () => groupByMonth(visibleTransactions),
    [visibleTransactions],
  );

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>
          Account / <b className={styles.eyebrowStrong}>Wallet</b>
        </span>
        <h1 className={styles.title}>Homekrafted Wallet</h1>
        <p className={styles.subtitle}>
          One balance across the store &amp; laundry. Pay in a tap, earn cashback on every order.
        </p>
      </div>

      {!ready ? (
        <p className={styles.loading}>Loading your wallet…</p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <WalletBalanceCard
              balance={balance}
              pendingCashback={pendingCashback}
              lifetimeSaved={lifetimeSaved}
            />

            <Card className={styles.addMoneyCard}>
              <span className={styles.sectionLabel}>Add money</span>
              <AmountPicker
                options={topupOptions}
                value={customValue === undefined ? selectedAmount : undefined}
                onChange={handlePickAmount}
                className={styles.amountGrid}
              />
              <label className={styles.customAmountLabel}>
                Or enter a custom amount
                <div className={styles.customAmountRow}>
                  <span className={styles.customAmountPrefix}>₹</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className={styles.customAmountInput}
                    placeholder="e.g. 1500"
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                  />
                </div>
              </label>
              <Button
                variant="primary"
                className={styles.topupButton}
                onClick={handleTopUp}
                disabled={!effectiveAmount}
              >
                Top up wallet →
              </Button>
              <p className={styles.bonusNote}>
                Get 3% extra on top-ups above {formatCurrency(TOPUP_BONUS_THRESHOLD)}
              </p>
              {toast && (
                <p className={styles.toast} role="status">
                  {toast}
                </p>
              )}
            </Card>

            <Card className={styles.autoTopupCard}>
              <div className={styles.autoTopupHeader}>
                <span className={styles.sectionLabel}>Auto top-up</span>
                <label className={styles.toggleRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={autoTopup.enabled}
                    onChange={(event) => setAutoTopup({ enabled: event.target.checked })}
                  />
                  {autoTopup.enabled ? "On" : "Off"}
                </label>
              </div>
              <p className={styles.autoTopupHint}>
                Automatically top up when your balance drops below a threshold — never get caught
                short at checkout.
              </p>
              <div className={styles.autoTopupFields}>
                <label className={styles.fieldLabel}>
                  When balance drops below
                  <div className={styles.fieldInputRow}>
                    <span className={styles.fieldPrefix}>₹</span>
                    <input
                      type="number"
                      min={0}
                      className={styles.fieldInput}
                      disabled={!autoTopup.enabled}
                      value={autoTopup.thresholdAmount ?? 0}
                      onChange={(event) =>
                        setAutoTopup({ thresholdAmount: Number(event.target.value) })
                      }
                    />
                  </div>
                </label>
                <label className={styles.fieldLabel}>
                  Top up by
                  <div className={styles.fieldInputRow}>
                    <span className={styles.fieldPrefix}>₹</span>
                    <input
                      type="number"
                      min={0}
                      className={styles.fieldInput}
                      disabled={!autoTopup.enabled}
                      value={autoTopup.topupAmount}
                      onChange={(event) =>
                        setAutoTopup({ topupAmount: Number(event.target.value) })
                      }
                    />
                  </div>
                </label>
              </div>
            </Card>

            <Card className={styles.payInfoCard}>
              <span className={styles.payInfoIcon}>
                <WalletIcon size={22} strokeWidth={1.6} />
              </span>
              <div>
                <div className={styles.payInfoTitle}>Pay with wallet at checkout</div>
                <div className={styles.payInfoHint}>
                  On by default · earns 5% back on every store order
                </div>
              </div>
            </Card>
          </div>

          <Card className={styles.historyCard}>
            <div className={styles.historyHeader}>
              <span className={styles.historyTitle}>Transactions</span>
              <span className={styles.historyMeta}>
                {showFullHistory ? "All time" : "Last 30 days"}
              </span>
            </div>

            {transactions.length === 0 ? (
              <p className={styles.emptyHistory}>No transactions yet.</p>
            ) : (
              groupedTransactions.map(([month, txns]) => (
                <div key={month} className={styles.historyGroup}>
                  {showFullHistory && <div className={styles.historyGroupLabel}>{month}</div>}
                  {txns.map((txn) => (
                    <TransactionRow key={txn.id} transaction={txn} />
                  ))}
                </div>
              ))
            )}

            {transactions.length > HISTORY_PREVIEW_COUNT && (
              <Button
                variant="secondary"
                className={styles.historyToggle}
                onClick={() => setShowFullHistory((current) => !current)}
              >
                {showFullHistory ? "Show less" : "View full history"}
              </Button>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
