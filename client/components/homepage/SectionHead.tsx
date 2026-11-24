import type { ReactNode } from "react";
import { MoreLink } from "@/components/ui/MoreLink";
import styles from "./SectionHead.module.css";

export interface SectionHeadProps {
  id: string;
  title: string;
  subtitle?: string;
  /** A "see all" door, set to the right of the centred title. */
  more?: { label: string; href: string };
  /** A small drawn mark either side of the title, in place of the rules. */
  ornament?: ReactNode;
}

/**
 * A centred serif title between two hairlines — the mockup's section
 * heading. The rules are decoration (`aria-hidden`); the `<h2>` is only
 * the words.
 */
export function SectionHead({ id, title, subtitle, more, ornament }: SectionHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.row}>
        {ornament ?? <span className={styles.rule} aria-hidden="true" />}
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {ornament ?? <span className={styles.rule} aria-hidden="true" />}
      </div>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {more && (
        <MoreLink href={more.href} className={styles.more}>
          {more.label}
        </MoreLink>
      )}
    </div>
  );
}
