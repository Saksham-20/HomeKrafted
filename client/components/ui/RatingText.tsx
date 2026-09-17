import { Star } from "lucide-react";
import styles from "./RatingText.module.css";

export interface RatingTextProps {
  rating: number;
  reviewCount: number;
  className?: string;
}

/**
 * "★ 4.9 (204)" as it should have been all along: a real `<Star>` icon,
 * not the literal glyph (2026-09-17 UI refinement, B6 in
 * docs/UI-REFINEMENT.md). Six call sites — `ProductCard`,
 * `StoreHeader`, `SellerRow`, `SellerDetailClient`, `FollowingClient`,
 * `/search` — each hand-rolled the same `★ ${rating} (${count})`
 * string, so the glyph (which renders a different shape on every OS)
 * drifted into six places instead of one. Callers still decide whether
 * to show it at all — `reviewCount > 0` — this component only draws the
 * fact once that decision is made.
 */
export function RatingText({ rating, reviewCount, className }: RatingTextProps) {
  return (
    <span className={className ? `${styles.rating} ${className}` : styles.rating}>
      <Star size={11} className={styles.icon} aria-hidden="true" />
      {rating.toFixed(1)} ({reviewCount})
    </span>
  );
}
