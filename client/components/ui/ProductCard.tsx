import type { MouseEvent } from "react";
import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Tag } from "./Tag";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import styles from "./ProductCard.module.css";

export interface ProductCardProps {
  product: Product;
  /** Vendor/maker display name — ProductCard is presentational and doesn't fetch it itself. */
  makerName: string;
  /** Whole-card click (ported from the prototype's `onClick` div) — wire up navigation here. */
  onCardClick?: () => void;
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
  added?: boolean;
  onAdd?: () => void;
  className?: string;
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Product card — ported from the Home "featured" rail / Shop listing grid.
 * 1:1 image, maker eyebrow, Fraunces title, rating · weight, price +
 * strikethrough MRP, round add button, corner wishlist heart. Root is a
 * plain clickable `<div>` (matching the prototype's own div+onClick
 * technique) so the wishlist/add buttons never nest inside an `<a>`.
 */
export function ProductCard({
  product,
  makerName,
  onCardClick,
  wishlisted = false,
  onToggleWishlist,
  added = false,
  onAdd,
  className,
}: ProductCardProps) {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  const image = product.images[0];
  const tag = product.tags[0];

  return (
    <div
      className={clsx(styles.card, onCardClick && styles.clickable, className)}
      onClick={onCardClick}
      role={onCardClick ? "button" : undefined}
      tabIndex={onCardClick ? 0 : undefined}
    >
      <div className={styles.imageWrap}>
        <ImageSlot
          ratio={image?.ratio ?? "1/1"}
          label={image?.placeholder ?? product.name}
          compact
        />
        {tag && <Tag label={tag} className={styles.tag} />}
        <button
          type="button"
          className={clsx(styles.wishlist, wishlisted && styles.wishlisted)}
          onClick={(event) => {
            stop(event);
            onToggleWishlist?.();
          }}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill={wishlisted ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M12 20s-7-4.4-7-9.6A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7 2.4C19 15.6 12 20 12 20z" />
          </svg>
        </button>
      </div>
      <div className={styles.content}>
        <span className={styles.maker}>{makerName}</span>
        <span className={styles.name}>{product.name}</span>
        <span className={styles.meta}>
          ★ {product.rating.toFixed(1)} ({product.reviewCount})
          {weight ? ` · ${weight.label}` : null}
        </span>
        <div className={styles.priceRow}>
          <span className={styles.priceGroup}>
            <span className={styles.price}>
              {formatCurrency(weight?.price ?? 0)}
            </span>
            {weight && weight.mrp > weight.price && (
              <span className={styles.mrp}>{formatCurrency(weight.mrp)}</span>
            )}
          </span>
          <button
            type="button"
            className={clsx(styles.add, added && styles.added)}
            onClick={(event) => {
              stop(event);
              onAdd?.();
            }}
            aria-label={added ? `${product.name} added` : `Add ${product.name}`}
          >
            {added ? "✓" : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}
