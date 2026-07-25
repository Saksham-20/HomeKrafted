import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Lift + gold border on hover — for clickable/composed cards. */
  hoverable?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Base card — the white/border/radius-lg recipe repeated throughout the
 * prototype (`background:#FFFFFF;border:1px solid #ECEAE4;border-radius:16px`).
 * Other card primitives (ProductCard, SnackCard, ServiceCard, ...) either
 * compose this or follow the same recipe directly when they need more
 * control over internal structure.
 */
export function Card({
  children,
  hoverable = false,
  padding = "md",
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        styles.card,
        hoverable && styles.hoverable,
        padding === "sm" && styles.paddingSm,
        padding === "md" && styles.paddingMd,
        padding === "lg" && styles.paddingLg,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
