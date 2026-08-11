import clsx from "clsx";
import { Card } from "@/components/ui/Card";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Terracotta value text for figures that need attention (e.g. low stock). */
  warn?: boolean;
  className?: string;
}

/**
 * Dashboard snapshot tile — mono eyebrow label, Fraunces value, optional
 * hint line.
 *
 * `data-testid` is read by `e2e/login-timing-dom.mjs`, which times the
 * moment a HomeKrafter's figures are actually on screen. That is a
 * different instant from the moment the heading names their kitchen, and
 * measuring only the heading hid which of the two requests was the slow
 * one (M31).
 */
export function StatCard({ label, value, hint, warn = false, className }: StatCardProps) {
  return (
    <Card className={clsx(styles.card, className)} data-testid="stat-card">
      <span className={styles.label}>{label}</span>
      <span className={clsx(styles.value, warn && styles.warn)}>{value}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </Card>
  );
}
