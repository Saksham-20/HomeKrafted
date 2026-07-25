import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./PromoBand.module.css";

export interface PromoBandProps {
  /** "dark" = pine gradient + gold accent (hamper band). "tint" = gold-tint (wallet band). */
  variant: "dark" | "tint";
  eyebrow: string;
  title: ReactNode;
  description: string;
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  className?: string;
}

/**
 * Promo band — ported from the Home page's hamper-builder (dark) and
 * wallet (tint) bands. Eyebrow + Fraunces H3 + copy + CTA. The CTA's look
 * is specific to each variant (gold-solid on dark, pine-solid on tint) and
 * isn't one of Button's 5 documented variants, so it's rendered inline
 * here rather than composing <Button>.
 */
export function PromoBand({
  variant,
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  onCtaClick,
  className,
}: PromoBandProps) {
  const cta = ctaHref ? (
    <a href={ctaHref} className={styles.cta} onClick={onCtaClick}>
      {ctaLabel}
    </a>
  ) : (
    <button type="button" className={styles.cta} onClick={onCtaClick}>
      {ctaLabel}
    </button>
  );

  return (
    <div
      className={clsx(
        styles.band,
        variant === "dark" ? styles.dark : styles.tint,
        className,
      )}
    >
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {cta}
    </div>
  );
}
