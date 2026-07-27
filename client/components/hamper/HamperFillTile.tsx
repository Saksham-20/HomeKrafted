import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import styles from "./HamperFillTile.module.css";

export interface HamperFillTileProps {
  product: Product;
  added: boolean;
  /** Box is at capacity and this product isn't already in it — disables the add button. */
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

/**
 * One "fill it up" grid tile — ported from the prototype's hamper fill
 * grid (`p.addBtn`/`p.addLabel`): image, Fraunces name, price, a single
 * add/added toggle button (no weight picker, no wishlist — a hamper line
 * is always the product's default weight, qty 1 per add).
 */
export function HamperFillTile({ product, added, disabled, onAdd, onRemove }: HamperFillTileProps) {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  const image = product.images[0];

  return (
    <div className={styles.tile}>
      <ImageSlot
        ratio={image?.ratio ?? "1/1"}
        label={image?.placeholder ?? product.name}
        src={image?.src}
        compact
      />
      <div className={styles.body}>
        <span className={styles.name}>{product.name}</span>
        <div className={styles.row}>
          <span className={styles.price}>{formatCurrency(weight?.price ?? 0)}</span>
          <button
            type="button"
            className={clsx(styles.addBtn, added && styles.added)}
            disabled={disabled && !added}
            onClick={added ? onRemove : onAdd}
            aria-pressed={added}
          >
            {added ? "✓ Added" : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
