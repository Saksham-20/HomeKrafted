import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { formatCurrency } from "@/lib/format";
import type { CartLineInfo } from "@/lib/cart/CartContext";
import styles from "./CartLineRow.module.css";

export interface CartLineRowProps {
  info: CartLineInfo;
  onQtyChange: (quantity: number) => void;
  onRemove: () => void;
}

/** One cart line — image, name, weight/hamper label, unit price, qty stepper, remove, line total. */
export function CartLineRow({ info, onQtyChange, onRemove }: CartLineRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.image}>
        <ImageSlot ratio={info.imageRatio} label={info.imageLabel} src={info.imageSrc} compact />
      </div>

      <div className={styles.body}>
        <span className={styles.name}>{info.name}</span>
        {info.weightLabel && <span className={styles.meta}>{info.weightLabel}</span>}
        <span className={styles.unitPrice}>{formatCurrency(info.unitPrice)} each</span>
      </div>

      <div className={styles.qtyCol}>
        {info.isHamper ? (
          <span className={styles.hamperQty}>Qty 1</span>
        ) : (
          <QuantityStepper
            value={info.quantity}
            onChange={onQtyChange}
            max={info.maxQuantity ?? 99}
            aria-label={`Quantity for ${info.name}`}
          />
        )}
      </div>

      <div className={styles.totalCol}>
        <span className={styles.lineTotal}>{formatCurrency(info.lineTotal)}</span>
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Remove ${info.name} from cart`}>
          ✕ Remove
        </button>
      </div>
    </div>
  );
}
