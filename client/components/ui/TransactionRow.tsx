import clsx from "clsx";
import { formatCurrency, formatDate } from "@/lib/format";
import type { WalletTransaction } from "@/lib/types";
import styles from "./TransactionRow.module.css";

export interface TransactionRowProps {
  transaction: WalletTransaction;
  className?: string;
}

/**
 * Wallet transaction row — icon tile (credit green down-arrow / debit
 * terracotta up-arrow), title, mono date, signed Fraunces amount. Ported
 * from the Wallet screen's transaction list.
 */
export function TransactionRow({ transaction, className }: TransactionRowProps) {
  const isCredit = transaction.direction === "credit";
  const signedAmount = isCredit ? transaction.amount : -transaction.amount;

  return (
    <div className={clsx(styles.row, className)}>
      <span
        className={clsx(styles.iconTile, isCredit ? styles.credit : styles.debit)}
        aria-hidden="true"
      >
        {isCredit ? "↓" : "↑"}
      </span>
      <div className={styles.body}>
        <div className={styles.title}>{transaction.title}</div>
        <div className={styles.date}>{formatDate(transaction.createdAt)}</div>
      </div>
      <span
        className={clsx(styles.amount, isCredit ? styles.credit : styles.debit)}
      >
        {formatCurrency(signedAmount, { sign: true })}
      </span>
    </div>
  );
}
