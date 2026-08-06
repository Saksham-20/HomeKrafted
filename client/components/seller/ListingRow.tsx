import Link from "next/link";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import styles from "./ListingRow.module.css";

export interface ListingRowProps {
  product: Product;
  categoryName?: string;
  onDelete?: (productId: string) => void;
}

/** Stock status is derived — `Product` has no lifecycle `status` field (that's a real gap the M8 schema would want a dedicated column for); this reads the lowest weight-tier stock instead. */
function stockStatus(product: Product): { label: string; className: string } {
  const stocks = product.weightOptions.map((w) => w.stock);
  const min = stocks.length > 0 ? Math.min(...stocks) : 0;
  if (min <= 0) return { label: "Out of stock", className: styles.outOfStock };
  if (min < 15) return { label: "Low stock", className: styles.lowStock };
  return { label: "In stock", className: styles.inStock };
}

/**
 * Where a HomeKrafter finds out what happened to a listing (M22).
 *
 * Without this the review gate is invisible from the side that matters:
 * they save a listing, it does not appear on the site, and nothing on this
 * screen says why or for how long. The rejection reason is shown verbatim,
 * next to the edit button that is the way out of it — a refusal with no
 * route back is a dead listing.
 *
 * `null` for a live listing: an approved item does not need a badge saying
 * so, and adding one to every row would bury the two states that need
 * reading.
 */
function reviewState(product: Product): { text: string; className: string } | null {
  switch (product.moderationStatus ?? "active") {
    case "pending":
      return {
        text: "Waiting for review — buyers can’t see this yet. We usually look within a day.",
        className: styles.reviewPending,
      };
    case "rejected":
      return {
        text: product.moderationNote
          ? `Not approved: ${product.moderationNote} — edit and save to send it back for review.`
          : "Not approved yet. Edit and save to send it back for review.",
        className: styles.reviewRejected,
      };
    case "hidden":
      return {
        text: product.moderationNote
          ? `Taken down by Homekrafted: ${product.moderationNote}`
          : "Taken down by Homekrafted.",
        className: styles.reviewRejected,
      };
    case "flagged":
      return {
        text: product.moderationNote
          ? `Paused while we look into this: ${product.moderationNote}`
          : "Paused while we look into this.",
        className: styles.reviewRejected,
      };
    default:
      return null;
  }
}

/** One row on `/seller/listings` — thumbnail, name + category, price, derived stock pill, edit/delete actions. */
export function ListingRow({ product, categoryName, onDelete }: ListingRowProps) {
  const weight = product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  const image = product.images[0];
  const stock = stockStatus(product);
  const review = reviewState(product);

  return (
    <Card padding="none" className={styles.row}>
      <div className={styles.thumb}>
        <ImageSlot
          ratio="1/1"
          label={image?.placeholder ?? product.name}
          alt={product.name}
          src={image?.src}
          sizes="64px"
          compact
        />
      </div>
      <div className={styles.body}>
        <span className={styles.name}>{product.name}</span>
        <span className={styles.meta}>
          {categoryName ?? "Uncategorised"} · {product.weightOptions.length} SKU
          {product.weightOptions.length === 1 ? "" : "s"}
        </span>
        {review && <span className={clsx(styles.reviewNote, review.className)}>{review.text}</span>}
      </div>
      <span className={styles.price}>{weight ? formatCurrency(weight.price) : "—"}</span>
      <span className={clsx(styles.stockPill, stock.className)}>{stock.label}</span>
      <div className={styles.actions}>
        <Link
          href={`/seller/listings/${product.id}`}
          className={styles.iconLink}
          aria-label={`Edit ${product.name}`}
        >
          <Pencil size={15} strokeWidth={1.7} />
        </Link>
        <button
          type="button"
          className={clsx(styles.iconLink, styles.deleteButton)}
          onClick={() => onDelete?.(product.id)}
          aria-label={`Delete ${product.name}`}
        >
          <Trash2 size={15} strokeWidth={1.7} />
        </button>
      </div>
    </Card>
  );
}
