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
  return (
    <div className={clsx(styles.row, className)}>
      <span className={clsx(styles.iconTile, isPaid ? styles.paid : styles.pending)} aria-hidden="true">
        {isPaid ? "✓" : "…"}
      </span>
      <div className={styles.body}>
        <span className={styles.title}>
          {formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)}
        </span>
        <span className={styles.date}>
          {isPaid && payout.paidAt ? `Paid ${formatDate(payout.paidAt)}` : "Pending settlement"}
        </span>
      </div>
      <span className={styles.amount}>{formatCurrency(payout.amount)}</span>
    </div>
  );
}
