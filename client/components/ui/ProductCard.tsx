import type { MouseEvent } from "react";
import Link from "next/link";
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
  /**
   * Where the card goes. **Prefer this over `onCardClick`.**
   *
   * Rendered as a real `<Link>` around the title, stretched over the whole
   * card by a CSS overlay — so the card keeps its whole-surface click
   * *and* becomes a genuine link: keyboard-activatable, middle-clickable,
   * "open in new tab", "copy link address".
   */
  href?: string;
  /**
   * Whole-card click, for a card with no destination URL (the dev
   * gallery). **A card with an `href` should not use this** — see the
   * component doc for why the `role="button"` version was a defect.
   */
  onCardClick?: () => void;
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
  added?: boolean;
  onAdd?: () => void;
  /**
   * Eager-load this card's image. Set it on the **first card of an
   * above-the-fold grid only** — that card is usually the page's LCP
   * element, and left lazy it is fetched only after layout, which delays
   * LCP by a round trip. Marking a whole grid priority is the same as
   * marking none: see `ImageSlot`'s `priority` doc comment.
   */
  priority?: boolean;
  className?: string;
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Product card — ported from the Home "featured" rail / Shop listing grid.
 * 1:1 image, maker eyebrow, Fraunces title, rating · weight, price +
 * strikethrough MRP, round add button, corner wishlist heart.
 *
 * **The card is a link, via an overlay on the title (M22).** It used to be
 * a `<div role="button" tabIndex={0} onClick>`, ported from the
 * prototype's div+onClick technique to keep the wishlist and add buttons
 * from nesting inside an `<a>`. That reasoning was right and the result
 * was still broken: React's `onClick` on a div does **not** fire for Enter
 * or Space, and nothing supplied a `onKeyDown`. So every product card on
 * every grid was focusable and could not be activated — a keyboard user
 * could tab through the entire shop and open nothing. Measured in a
 * browser: click navigated, Enter and Space did not.
 *
 * The stretched-link pattern fixes both halves at once. The title is a
 * real anchor whose `::after` covers the card, so the whole surface stays
 * clickable and the destination is a real URL (openable in a new tab,
 * which a div never was); the two buttons sit above it in z-order, so they
 * are still buttons and still not inside the anchor.
 */
export function ProductCard({
  product,
  makerName,
  href,
  onCardClick,
  wishlisted = false,
  onToggleWishlist,
  added = false,
  onAdd,
  priority = false,
  className,
}: ProductCardProps) {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  const image = product.images[0];
  const tag = product.tags[0];

  return (
    <div
      className={clsx(styles.card, (href || onCardClick) && styles.clickable, className)}
      // Only for the href-less variant. With an `href` the anchor below
      // does the work, and adding a redundant div handler here would
      // double-fire navigation on every click.
      onClick={href ? undefined : onCardClick}
      role={!href && onCardClick ? "button" : undefined}
      tabIndex={!href && onCardClick ? 0 : undefined}
      onKeyDown={
        !href && onCardClick
          ? (event) => {
              // A `role="button"` div owes this. Without it the element
              // claims to be a button and then ignores the two keys a
              // button must answer to.
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCardClick();
              }
            }
          : undefined
      }
    >
      <div className={styles.imageWrap}>
        <ImageSlot
          ratio={image?.ratio ?? "1/1"}
          label={image?.placeholder ?? product.name}
          // The product's name, not the placeholder caption — a screen
          // reader hearing "MANGO THOKKU — HERO" has been read a filename.
          alt={product.name}
          src={image?.src}
          sizes="(max-width: 640px) 45vw, (max-width: 1180px) 30vw, 260px"
          priority={priority}
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
        <span className={styles.name}>
          {href ? (
            <Link href={href} className={styles.nameLink}>
              {product.name}
            </Link>
          ) : (
            product.name
          )}
        </span>
        <span className={styles.meta}>
          {/*
            No reviews is not a rating of zero. Every craft listing showed
            "★ 0.0 (0)", which reads as "rated zero out of five" for a maker
            nobody has reviewed yet — the worst possible score, shown to
            every listing on its first day. Same rule as M16's
            `cancellationRate`, which is `null` rather than `0` before
            anything has closed: absence gets said as absence.
          */}
          {product.reviewCount > 0 ? `★ ${product.rating.toFixed(1)} (${product.reviewCount})` : "New"}
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
