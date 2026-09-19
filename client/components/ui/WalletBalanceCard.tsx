import clsx from "clsx";
import { formatCurrency } from "@/lib/format";
import styles from "./WalletBalanceCard.module.css";

export interface WalletBalanceCardProps {
  balance: number;
  className?: string;
}

/**
 * Wallet balance card — pine gradient, gold mono eyebrow, 52px Fraunces
 * balance, decorative circle. Ported from the Wallet screen's balance panel.
 *
 * It used to carry a "Pending cashback" and a "Lifetime saved" row. Both were
 * cashback-only figures, and order cashback was removed on 2026-09-19 — the
 * first was never written by anything, the second only grew with a cashback
 * credit — so the card is the balance and nothing else.
 */
export function WalletBalanceCard({ balance, className }: WalletBalanceCardProps) {
  return (
    <div className={clsx(styles.card, className)}>
      <span className={styles.decoCircle} aria-hidden="true" />
      <span className={styles.eyebrow}>Available balance</span>
      <div className={styles.balance}>{formatCurrency(balance)}</div>
    </div>
  );
}
