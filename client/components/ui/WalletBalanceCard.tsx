import clsx from "clsx";
import { formatCurrency } from "@/lib/format";
import styles from "./WalletBalanceCard.module.css";

export interface WalletBalanceCardProps {
  balance: number;
  pendingCashback: number;
  lifetimeSaved: number;
  className?: string;
}

/**
 * Wallet balance card — pine gradient, gold mono eyebrow, 52px Fraunces
 * balance, pending/lifetime row, decorative circle. Ported from the
 * Wallet screen's balance panel.
 */
export function WalletBalanceCard({
  balance,
  pendingCashback,
  lifetimeSaved,
  className,
}: WalletBalanceCardProps) {
  return (
    <div className={clsx(styles.card, className)}>
      <span className={styles.decoCircle} aria-hidden="true" />
      <span className={styles.eyebrow}>Available balance</span>
      <div className={styles.balance}>{formatCurrency(balance)}</div>
      <div className={styles.row}>
        <span>
          Pending cashback{" "}
          <b className={styles.figure}>{formatCurrency(pendingCashback)}</b>
        </span>
        <span>
          Lifetime saved{" "}
          <b className={styles.figure}>{formatCurrency(lifetimeSaved)}</b>
        </span>
      </div>
    </div>
  );
}
