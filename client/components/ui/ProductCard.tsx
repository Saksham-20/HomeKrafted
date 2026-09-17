import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, Clock } from "lucide-react";
import { CardPhotos } from "./CardPhotos";
import { Tag } from "./Tag";
import { DietDot } from "./DietDot";
import { RatingText } from "./RatingText";
import { formatCurrency } from "@/lib/format";
import { dietOf } from "@/lib/diet";
import { preOrderLabel } from "@/lib/pre-order";
import type { Product } from "@/lib/types";
import styles from "./ProductCard.module.css";

export interface ProductCardProps {
  product: Product;
  /** Vendor/maker display name — ProductCard is presentational and doesn't fetch it itself. */
  makerName: string;
  /**
   * Where the card goes — the only way to make the card clickable.
   *
   * Rendered as a real `<Link>` around the title, stretched over the whole
   * card by a CSS overlay — so the card keeps its whole-surface click
   * *and* is a genuine link: keyboard-activatable, middle-clickable,
   * "open in new tab", "copy link address".
   *
   * There is deliberately no `onCardClick` escape hatch. One existed until
   * M28 and turned the card into a `role="button"` div wrapping the
   * wishlist and add buttons — axe's `nested-interactive`, and a shape
   * that has already shipped one keyboard-dead catalogue (see the
   * component doc). A card with no destination is not clickable.
   */
  href?: string;
  /**
   * One line of fact under the title, from real columns (G3 §5.1).
   *
   * Built by `lib/gift/fact-line.ts`, which answers `null` far more often
   * than it answers a sentence — that is the point. This slot is where
   * `/gifts` used to carry "Authentic" and a size label reading "One", and
   * the 2026-09-14 sweep deleted that family for claiming what no column
   * said. A card with nothing answered renders nothing here.
   */
  factLine?: string | null;
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
  added?: boolean;
  onAdd?: () => void;
  /**
   * Every size is out of stock. The "+" becomes a plain "Sold out" mark:
   * a button that 400s on press and then says "✓" is what this card
   * shipped until 2026-09-03.
   */
  soldOut?: boolean;
  /**
   * Replaces the add button with this label when the listing can't be
   * bought for a reason that isn't stock — today, food while it is coming
   * soon. Sold out still wins: it is the more specific fact.
   */
  unavailableLabel?: string;
  /** The server's refusal for the last press, shown under the price row. */
  addError?: string | null;
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
 *
 * **M28 deleted the leftover `onCardClick` variant.** M22 fixed every real
 * surface by giving it an `href`, but kept the div+`onClick` path alive for
 * callers without a URL — and added the `onKeyDown` it owed, so it was no
 * longer keyboard-dead. It was still a `role="button"` element containing
 * two real buttons, which is axe's `nested-interactive`, and it was the one
 * finding left on the M28 sweep. Its only remaining caller in the whole
 * codebase was `/gallery`, the dev-only primitives page. Deleting the
 * variant removes the finding outright rather than working around it, and
 * closes the door on a second surface adopting the shape.
 */
/**
 * The size label a listing gets when nobody named a size: "One" (the guided
 * form's `DEFAULT_SIZE_LABEL`) in any case, or "One · Mint, Silver" where the
 * colour swatches were merged onto it. Only the size half is a placeholder;
 * the colours are real, but the card has no room to say them well and the
 * product page does.
 */
function isPlaceholderSize(label: string): boolean {
  return label.split("·")[0].trim().toLowerCase() === "one";
}

function isRecentlyCreated(product: Product): boolean {
  const dateStr = product.createdAt ?? product.submittedAt ?? product.moderatedAt;
  if (!dateStr) return false;
  const created = new Date(dateStr).getTime();
  if (isNaN(created)) return false;
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays <= 30;
}

/**
 * The badge, when there is something real to put in it.
 *
 * Only the tags a person actually set, and `New` only while it is true.
 * **There is no fallback, and most cards carry no badge** — that is the
 * point. The chain used to end in three claims nobody made (2026-09-14):
 *
 * - `shippingScope === "local"` → **"Fresh Today"**. That column answers how
 *   far a listing may travel, not when it was cooked; it put "Fresh Today"
 *   on a jar of pickle that keeps for six months.
 * - `kind === "craft"` → **"Handcrafted"**, on a page of handcrafted goods.
 * - `kind === "food"` → **"Verified Kitchen"**, which is the one that
 *   mattered: `fssaiVerified` and `identityVerified` are real columns only
 *   an admin can set (M16), and this claimed the badge for every food
 *   listing on the site without reading either of them. A verification
 *   badge that is really `kind === "food"` is worth nothing, and it
 *   devalues the real one on the storefront.
 *
 * Between them they meant every card had a badge, which is decoration —
 * the same argument that keeps the pre-order badge off every listing.
 */
function resolveMerchandisingBadge(product: Product, isSoldOut = false): string | undefined {
  if (isSoldOut) return undefined;
  if (product.tags?.includes("Bestseller")) return "Bestseller";
  if (product.tags?.includes("Festive")) return "Festive";
  if (product.tags?.includes("Curated")) return "Curated";
  if (product.tags?.includes("New") && isRecentlyCreated(product)) return "New";
  return undefined;
}

export function ProductCard({
  product,
  makerName,
  href,
  factLine = null,
  wishlisted = false,
  onToggleWishlist,
  added = false,
  onAdd,
  soldOut = false,
  unavailableLabel,
  addError = null,
  priority = false,
  className,
}: ProductCardProps) {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  const tag = resolveMerchandisingBadge(product, soldOut);
  const diet = dietOf(product);
  const preOrder = preOrderLabel(product);
  /*
    The line under the name says only what a column records.

    No reviews is not a rating of zero: every craft listing used to show
    "★ 0.0 (0)", the worst possible score on its first day (M16's
    `cancellationRate` rule — absence gets said as absence).

    Two fallbacks are gone (2026-09-16, docs/GIFTING-REWORK.md B7).
    "Authentic" was printed on every unreviewed listing older than a month,
    a claim nothing records (the 2026-09-14 trust rule). And a size label
    of "One" — the guided form's default, 65 of 86 live gifts — told a
    buyer nothing, so a single-size listing prints no size at all.

    The `★` glyph is a real `<Star>` now (2026-09-17, via the shared
    `RatingText`) — a unicode character standing in for an icon renders a
    different glyph on every OS and is the exact pattern the icon-system
    rule bans.
  */
  const reviewPart: ReactNode =
    product.reviewCount > 0 ? (
      <RatingText rating={product.rating} reviewCount={product.reviewCount} />
    ) : isRecentlyCreated(product) && !soldOut ? (
      "New"
    ) : null;
  const sizePart = weight && !isPlaceholderSize(weight.label) ? weight.label : null;
  const metaParts = [reviewPart, sizePart].filter(Boolean);
  return (
    <div
      className={clsx(styles.card, href && styles.clickable, className)}
      data-testid="product-card"
    >
      <div className={styles.imageWrap}>
        {/*
          The photographs, with arrows when the maker uploaded more than
          one. `alt` is the product's name, not the placeholder caption —
          a screen reader hearing "MANGO THOKKU — HERO" has been read a
          filename.
        */}
        <CardPhotos images={product.images} name={product.name} priority={priority} />
        {tag && <Tag label={tag} className={styles.tag} />}
        {/*
          "Pre-order · 2 days" (2026-09-05, owner). On the photograph
          rather than in the meta line, because it changes whether
          somebody can have this today — that is a decision made while
          scanning a grid, not after opening the listing.

          `preOrderLabel` returns `undefined` unless the *listing's own*
          `prepTimeMins` clears the threshold, so a listing whose maker
          was never asked carries nothing. See `lib/pre-order.ts` for why
          it never falls back to the kitchen's default.
        */}
        {preOrder && (
          <span className={styles.preOrder}>
            <Clock size={12} strokeWidth={2} aria-hidden="true" />
            {preOrder}
          </span>
        )}
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
          {/*
            The FSSAI-style mark, beside the name where that scheme puts
            it. Absent for a craft listing and for any food listing whose
            maker has not been asked — `dietOf` answers `undefined` for
            both and never guesses between them, because a green mark on
            an untagged dish is the one mistake here that can hurt
            somebody (`lib/diet.ts`).
          */}
          {diet && <DietDot diet={diet} className={styles.diet} />}
          {href ? (
            <Link href={href} className={styles.nameLink}>
              {product.name}
            </Link>
          ) : (
            product.name
          )}
        </span>
        {metaParts.length > 0 && (
          <span className={styles.meta}>
            {metaParts.map((part, index) => (
              <span key={index}>
                {index > 0 && " · "}
                {part}
              </span>
            ))}
          </span>
        )}
        {factLine && <span className={styles.factLine}>{factLine}</span>}
        <div className={styles.priceRow}>
          {/*
            M46 — three prices exist on a discounted listing and only two
            may be shown, or the card becomes a puzzle. `salePrice` is
            what a buyer pays and `price` is what it is struck through
            against; `mrp` (the per-product offer) is deliberately dropped
            while a storefront discount runs, because two crossed-out
            numbers next to one real one reads as a trick.

            `salePrice` is computed server-side (`mapProduct`) so the card
            and the checkout cannot disagree — this component never does
            the arithmetic.
          */}
          <span className={styles.priceGroup}>
            <span className={styles.price}>
              {formatCurrency(weight?.salePrice ?? weight?.price ?? 0)}
            </span>
            {weight?.salePrice !== undefined ? (
              <span className={styles.mrp}>{formatCurrency(weight.price)}</span>
            ) : (
              weight && weight.mrp > weight.price && (
                <span className={styles.mrp}>{formatCurrency(weight.mrp)}</span>
              )
            )}
            {product.discountPct !== undefined && (
              <span className={styles.discountBadge}>{product.discountPct}% off</span>
            )}
          </span>
          {soldOut ? (
            <span className={styles.soldOut}>Sold out</span>
          ) : unavailableLabel ? (
            <span className={styles.soldOut}>{unavailableLabel}</span>
          ) : (
            <button
              type="button"
              className={clsx(styles.add, added && styles.added)}
              onClick={(event) => {
                stop(event);
                onAdd?.();
              }}
              aria-label={added ? `${product.name} added` : `Add ${product.name}`}
            >
              {added ? <Check size={17} aria-hidden="true" /> : "+"}
            </button>
          )}
        </div>
        {addError && (
          <p className={styles.addError} role="alert">
            {addError}
          </p>
        )}
      </div>
    </div>
  );
}
