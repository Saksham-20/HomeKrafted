import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost-gold"
  | "whatsapp"
  | "icon";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style, ported from the prototype's button set:
   * `primary` (pine fill), `secondary` (pine outline), `ghost-gold`
   * (gold outline, e.g. "add to hamper"), `whatsapp` (WhatsApp green,
   * Snacks channel only), `icon` (square/round icon-only — always pass
   * `aria-label`).
   */
  variant?: ButtonVariant;
  /** Padding/type scale. Maps to a fixed square size for variant="icon". */
  size?: ButtonSize;
  /**
   * Only applies to variant="icon" — the prototype uses both shapes
   * (round for wishlist/cart/close, square for the header hamburger).
   * Defaults to "round".
   */
  shape?: "round" | "square";
  children?: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  "ghost-gold": styles.ghostGold,
  whatsapp: styles.whatsapp,
  icon: styles.icon,
};

const SIZE_CLASS: Record<ButtonSize, string> = { sm: styles.sm, md: styles.md };
const ICON_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: styles.iconSm,
  md: styles.iconMd,
};

/** Inline WhatsApp glyph, ported verbatim from the prototype — never recolor. */
function WhatsAppGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={styles.glyph}
    >
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.6.7.7-2.5-.2-.3A8 8 0 0 1 12 4z" />
    </svg>
  );
}

/**
 * Primary button primitive — ported from the prototype's pill buttons
 * (hero CTAs, product-detail add-to-cart, wallet/hamper band CTAs,
 * WhatsApp send-list). `variant="whatsapp"` auto-leads with the WhatsApp
 * glyph so callers just pass the label as children.
 */
export function Button({
  variant = "primary",
  size = "md",
  shape = "round",
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        styles.button,
        VARIANT_CLASS[variant],
        variant === "icon" ? ICON_SIZE_CLASS[size] : SIZE_CLASS[size],
        variant === "icon" && shape === "square" && styles.iconSquare,
        className,
      )}
      {...rest}
    >
      {variant === "whatsapp" && <WhatsAppGlyph />}
      {children}
    </button>
  );
}
