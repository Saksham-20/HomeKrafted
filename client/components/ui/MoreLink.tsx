import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./MoreLink.module.css";

export interface MoreLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Opens in a new tab: up-right arrow, and the new tab is announced. */
  newTab?: boolean;
}

/**
 * "Go somewhere else from here" — the landing's "See everything →" link,
 * one component for every page (2026-11-22). Bold ink words on a gold
 * underline, and a drawn arrow that moves on hover; it was a typed "→" in
 * pine at a different size on every screen that had one.
 *
 * A link, never a button: it always goes to a page.
 */
export function MoreLink({ href, children, className, newTab }: MoreLinkProps) {
  const Icon = newTab ? ArrowUpRight : ArrowRight;
  return (
    <Link
      href={href}
      className={clsx(styles.link, className)}
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
    >
      <span>
        {children}
        {newTab && <span className="hk-sr-only"> (opens in a new tab)</span>}
      </span>
      <Icon className={styles.icon} aria-hidden="true" />
    </Link>
  );
}
