"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AmountPicker } from "@/components/ui/AmountPicker";
import { TransactionRow } from "@/components/ui/TransactionRow";
import { WalletBalanceCard } from "@/components/ui/WalletBalanceCard";
import { SignedOutNotice } from "@/components/auth/SignedOutNotice";
import { apiErrorMessage, getPaymentsConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { TOPUP_BONUS_RATE, TOPUP_BONUS_THRESHOLD, useWallet } from "@/lib/wallet/WalletContext";
import { formatCurrency, formatDate } from "@/lib/format";
import { kitchenLoading, WALLET_LOADING } from "@/lib/kitchen-copy";
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
  const { isSignedIn, ready: authReady } = useAuth();
  const {
    balance,
    pendingCashback,
    lifetimeSaved,
    transactions,
    hasMoreTransactions,
    loadMoreTransactions,
    autoTopup,
    ready,
    topUp,
  } = useWallet();

  const [selectedAmount, setSelectedAmount] = useState(topupOptions[0] ?? 500);
  const [customAmount, setCustomAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** True from the moment the payment widget opens until it closes either way — see `handleTopUp`. */
  const [topupInFlight, setTopupInFlight] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Undefined until the answer is known, so the button never renders in a
  // state the server has not confirmed.
  const [cardPayments, setCardPayments] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getPaymentsConfig().then((config) => {
      if (!cancelled) setCardPayments(config.cardPaymentsEnabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A typed amount is honoured exactly or refused — never quietly swapped
  // for the selected chip. The audit typed `-100`, pressed Top up, and the
  // page opened a ₹500 charge: `customValue > 0` failed, so the chip
  // amount was substituted with nothing said. Whatever is in the box is
  // what gets charged.
  const trimmedCustom = customAmount.trim();
  const customValue = trimmedCustom ? Number(trimmedCustom) : undefined;
  const customIsValid =
    customValue !== undefined && Number.isFinite(customValue) && customValue > 0;
  const effectiveAmount = customValue === undefined ? selectedAmount : customValue;
  const bonus =
    effectiveAmount > TOPUP_BONUS_THRESHOLD ? Math.round(effectiveAmount * TOPUP_BONUS_RATE) : 0;

  function handlePickAmount(amount: number) {
    setSelectedAmount(amount);
    setCustomAmount("");
    setAmountError(null);
  }

  /**
   * Add money to the wallet.
   *
   * The `await` here spans the **entire Razorpay widget session** — open,
   * card details typed, 3-D Secure, success or dismissal. That can be two
   * minutes, not two hundred milliseconds, which is why the in-flight
   * label says "Waiting for payment…" rather than the "Adding…" that
   * would be right for a quick request, and why the amount controls are
   * disabled with it: an amount picker that still responds while a
   * payment sheet is open is offering a choice that no longer changes
   * anything.
   *
   * The guard is a double-submit fix, not a double-credit one. Real
   * credit only ever lands via `creditTopupTx` from the HMAC-verified
   * Razorpay webhook, so a second click could not have minted balance —
   * it could open a second widget, which is confusing rather than
   * expensive. Reset in a `finally` so a dismissed widget re-enables the
   * button (`onDismiss` rejects).
   */
  async function handleTopUp() {
    if (topupInFlight) return;
    if (customValue !== undefined && !customIsValid) {
      setAmountError("Enter an amount greater than ₹0, or pick one above.");
      return;
    }
    setAmountError(null);
    if (!effectiveAmount || effectiveAmount <= 0) return;
    setTopupInFlight(true);
    try {
      await topUp(effectiveAmount);
      setToast(
        bonus
          ? `Added ${formatCurrency(effectiveAmount)} + ${formatCurrency(bonus)} bonus to your wallet`
          : `Added ${formatCurrency(effectiveAmount)} to your wallet`,
      );
      setCustomAmount("");
    } catch (error) {
      setToast(
        error instanceof Error && error.message === "PAYMENTS_UNAVAILABLE"
          ? "Adding money isn't available yet — no charge was made."
          : "Top-up wasn't completed — no charge was made.",
      );
    } finally {
      setTopupInFlight(false);
    }
    window.setTimeout(() => setToast(null), 3500);
  }

  async function handleLoadMore() {
    setHistoryError(null);
    setLoadingMore(true);
    try {
      await loadMoreTransactions();
    } catch (err) {
      setHistoryError(
        apiErrorMessage(err, "Couldn't load older transactions. Try again."),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const visibleTransactions = showFullHistory
    ? transactions
    : transactions.slice(0, HISTORY_PREVIEW_COUNT);
  const groupedTransactions = useMemo(
    () => groupByMonth(visibleTransactions),
    [visibleTransactions],
  );

  // Same gate `/account/*` gets from `AccountShell`. `/wallet` is a
  // sibling route with no shell, so before the audit it had none: a
  // signed-out visitor got a full wallet reading "available balance ₹0"
  // and a top-up form that worked right up until the button, which threw
  // them at `/login` and discarded the amount they had typed.
  //
  // Below every hook on purpose — an early return above `useMemo` changes
  // the hook order between renders (caught by `react-hooks/rules-of-hooks`).
  if (authReady && !isSignedIn) {
    return (
      <SignedOutNotice eyebrow="Wallet">
        Sign in to see your balance, add money and review your transactions.
      </SignedOutNotice>
    );
  }

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>
          Account / <b className={styles.eyebrowStrong}>Wallet</b>
        </span>
        <h1 className={styles.title}>Homekrafted Wallet</h1>
        <p className={styles.subtitle}>
          One balance across everything you order. Pay in a tap, earn cashback on every order.
        </p>
      </div>

      {!ready ? (
        <p className={styles.loading} role="status" aria-live="polite">
          {kitchenLoading("wallet", WALLET_LOADING)}
        </p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <WalletBalanceCard
              balance={balance}
              pendingCashback={pendingCashback}
              lifetimeSaved={lifetimeSaved}
            />

            {/*
              Add money is only offered where money can actually move. With
              no Razorpay keys the old card rendered in full and its button
              opened a Checkout widget that 401s, hides itself and never
              calls back — a dead control that also left the page
              scroll-locked. Same reasoning as the paused auto-top-up card
              below: say what is true, don't render a promise that isn't.
            */}
            {cardPayments === false ? (
              <Card className={styles.addMoneyCard}>
                <div className={styles.addMoneyHeader}>
                  <span className={styles.sectionLabel}>Add money</span>
                  <span className={styles.pausedPill}>Not available yet</span>
                </div>
                <p className={styles.autoTopupHint}>
                  We&apos;re still setting up online payments, so the wallet can&apos;t be
                  topped up from here yet. Your balance, cashback and refunds all work as
                  normal.
                </p>
              </Card>
            ) : (
            <Card className={styles.addMoneyCard}>
              <span className={styles.sectionLabel}>Add money</span>
              <AmountPicker
                options={topupOptions}
                value={customValue === undefined ? selectedAmount : undefined}
                onChange={handlePickAmount}
                className={styles.amountGrid}
                disabled={topupInFlight}
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
                    disabled={topupInFlight}
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={amountError ? "topup-amount-error" : undefined}
                    onChange={(event) => {
                      setCustomAmount(event.target.value);
                      setAmountError(null);
                    }}
                  />
                </div>
              </label>
              {amountError && (
                <p className={styles.amountError} id="topup-amount-error" role="alert">
                  {amountError}
                </p>
              )}
              <Button
                variant="primary"
                className={styles.topupButton}
                onClick={handleTopUp}
                disabled={!effectiveAmount || cardPayments === undefined || topupInFlight}
                aria-busy={topupInFlight || undefined}
              >
                {topupInFlight ? "Waiting for payment…" : "Top up wallet →"}
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
            )}

            {/*
              Auto top-up is paused platform-wide: the credit it used to post
              had no captured payment behind it, so the server no longer fires
              it and refuses `enabled: true`.

              Three things this deliberately does NOT do. It does not render a
              disabled toggle — a dead control under a promise that is now
              false is a dark pattern. It does not hide the card, because the
              people who most need the notice are exactly those who configured
              a rule. And it does not use a danger tone: this is paused, not
              broken.
            */}
            <Card className={styles.autoTopupCard}>
              <div className={styles.autoTopupHeader}>
                <span className={styles.sectionLabel}>Auto top-up</span>
                <span className={styles.pausedPill}>Paused</span>
              </div>
              <p className={styles.autoTopupHint}>
                Auto top-up is paused while we move it onto a proper payment mandate.
                {cardPayments === false
                  ? " Adding money isn't available yet either — see above."
                  : " Top up manually above — it takes a few seconds."}
              </p>
              {autoTopup.enabled && autoTopup.topupAmount > 0 && (
                <p className={styles.autoTopupSavedRule}>
                  Your saved rule: add {formatCurrency(autoTopup.topupAmount)} when the balance
                  drops below {formatCurrency(autoTopup.thresholdAmount ?? 0)}.{" "}
                  <b>It is not running.</b>
                </p>
              )}
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

            {(transactions.length > HISTORY_PREVIEW_COUNT || hasMoreTransactions) && (
              <Button
                variant="secondary"
                className={styles.historyToggle}
                onClick={() => setShowFullHistory((current) => !current)}
              >
                {showFullHistory ? "Show less" : "View full history"}
              </Button>
            )}

            {/* The ledger arrives one page at a time, so "full history" is
                only as full as what has been fetched. Rather than let that
                read as "this is everything", the next page is offered
                explicitly. */}
            {showFullHistory && hasMoreTransactions && (
              <Button
                variant="secondary"
                className={styles.historyToggle}
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? "Loading…" : "Load older transactions"}
              </Button>
            )}

            {historyError && (
              <p className={styles.historyError} role="alert">
                {historyError}
              </p>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
