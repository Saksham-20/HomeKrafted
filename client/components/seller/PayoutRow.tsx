import clsx from "clsx";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Payout } from "@/lib/types";
import styles from "./PayoutRow.module.css";

export interface PayoutRowProps {
  payout: Payout;
  className?: string;
}

/**
 * Payout ledger row — `TransactionRow`-style (icon tile, title, mono
 * date, Fraunces amount) but for `Payout`, not `WalletTransaction` (the
 * shapes don't line up: no `direction`/`category` on a payout), so this
 * is its own small component rather than a forced fit into the wallet
 * primitive.
 */
export function PayoutRow({ payout, className }: PayoutRowProps) {
  const isPaid = payout.status === "paid";
  const isRejected = payout.status === "rejected";

  // What happened to this request, in one line. Before M15 there was only
  // "Pending settlement" forever, because nothing could settle a payout.
  const statusLine = isPaid
    ? `Paid ${payout.paidAt ? formatDate(payout.paidAt) : ""}${payout.reference ? ` · ref ${payout.reference}` : ""}`
    : isRejected
      ? `Declined${payout.decidedAt ? ` ${formatDate(payout.decidedAt)}` : ""}`
      : "Pending settlement";

  return (
    <div className={clsx(styles.row, className)}>
      <span
        className={clsx(
          styles.iconTile,
          isPaid ? styles.paid : isRejected ? styles.rejected : styles.pending,
        )}
        aria-hidden="true"
      >
        {isPaid ? "✓" : isRejected ? "×" : "…"}
      </span>
      <div className={styles.body}>
        <span className={styles.title}>
          {formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)}
        </span>
        <span className={styles.date}>{statusLine}</span>
        {/* A refusal with no reason attached is worse than one that never
            happened — the admin has to give one, so show it. */}
        {isRejected && payout.note ? <span className={styles.note}>{payout.note}</span> : null}
      </div>
      <span className={styles.amount}>{formatCurrency(payout.amount)}</span>
    </div>
  );
}
