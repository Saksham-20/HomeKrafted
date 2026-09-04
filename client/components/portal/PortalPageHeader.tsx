import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./PortalPageHeader.module.css";

export interface PortalPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Buttons on the right; wraps under the title on a phone. */
  actions?: ReactNode;
  /** A way back up — "← Products" on an edit screen. */
  back?: { href: string; label: string };
  /** Mono line above the title — the section a detail screen belongs to. */
  eyebrow?: string;
}

/**
 * The title row on every `/seller/*` and `/admin/*` screen. The two
 * portals had identical copies (`SellerPageHeader`, `AdminPageHeader`);
 * both now render this, and it grew the two things a detail screen was
 * missing — a back link and an eyebrow.
 */
export function PortalPageHeader({ title, subtitle, actions, back, eyebrow }: PortalPageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        {back && (
          <Link href={back.href} className={styles.back}>
            <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
