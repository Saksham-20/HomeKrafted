import clsx from "clsx";
import { Card } from "@/components/ui/Card";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Terracotta value text for figures that need attention (e.g. pending applications). */
  warn?: boolean;
  className?: string;
}

/**
 * Dashboard snapshot tile — mono eyebrow label, Fraunces value, optional
 * hint line. Deliberately mirrors `components/seller/StatCard.tsx`
 * (same recipe, same tokens) rather than importing it — the two role
 * surfaces stay independent components on purpose, same as
 * `AdminShell`/`SellerShell` (see `AdminShell`'s doc comment).
 */
export function StatCard({ label, value, hint, warn = false, className }: StatCardProps) {
  return (
    <Card className={clsx(styles.card, className)}>
      <span className={styles.label}>{label}</span>
      <span className={clsx(styles.value, warn && styles.warn)}>{value}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </Card>
  );
}
