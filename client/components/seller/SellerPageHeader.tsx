import type { ReactNode } from "react";
import styles from "./SellerPageHeader.module.css";

export interface SellerPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Shared page-title row for every `/seller/*` screen — title/subtitle left, action buttons (e.g. "Add listing") right, wraps on mobile. */
export function SellerPageHeader({ title, subtitle, actions }: SellerPageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
