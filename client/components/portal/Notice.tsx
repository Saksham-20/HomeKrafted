import type { ReactNode } from "react";
import clsx from "clsx";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import styles from "./Notice.module.css";

export type NoticeTone = "info" | "warning" | "success" | "danger";

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  /** Buttons or links that act on the notice. */
  actions?: ReactNode;
  onDismiss?: () => void;
  /**
   * Announce it when it appears. `danger` is always announced (as an
   * alert); everything else only when this is set — a standing notice at
   * the top of a queue should not be read out on every visit.
   */
  live?: boolean;
  className?: string;
}

const ICON = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  danger: AlertCircle,
} as const;

/**
 * A callout with a tone — the one shape for the gross-payout notice, the
 * "approved but we could not reach them" banner, a refused action and a
 * "saved" confirmation. Each screen had drawn its own.
 */
export function Notice({ tone = "info", title, children, actions, onDismiss, live, className }: NoticeProps) {
  const Icon = ICON[tone];
  return (
    <div
      className={clsx(styles.notice, styles[tone], className)}
      role={tone === "danger" ? "alert" : live ? "status" : undefined}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        {title && <strong className={styles.title}>{title}</strong>}
        <div className={styles.text}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
