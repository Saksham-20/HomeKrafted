import Link from "next/link";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import type { Snack } from "@/lib/types";
import styles from "./SnackMenuRow.module.css";

const CATEGORY_LABEL: Record<Snack["category"], string> = {
  savoury: "Savoury",
  sweet: "Sweet",
  baked: "Baked",
  namkeen: "Namkeen",
};

export interface SnackMenuRowProps {
  snack: Snack;
  onDelete?: (snackId: string) => void;
}

/** One row on `/seller/menu` — thumbnail, name + category/diet, price, available pill, edit/delete actions. Mirrors `ListingRow`'s shape for the maker Listings screen. */
export function SnackMenuRow({ snack, onDelete }: SnackMenuRowProps) {
  return (
    <Card padding="none" className={styles.row}>
      <div className={styles.thumb}>
        <ImageSlot ratio="1/1" label={snack.imagePlaceholder} src={snack.imageSrc} compact />
      </div>
      <div className={styles.body}>
        <span className={styles.name}>{snack.name}</span>
        <span className={styles.meta}>
          {CATEGORY_LABEL[snack.category]} · {snack.diet === "veg" ? "Veg" : "Non-veg"}
        </span>
      </div>
      <span className={styles.price}>{formatCurrency(snack.price)}</span>
      <span className={clsx(styles.availabilityPill, snack.available ? styles.available : styles.unavailable)}>
        {snack.available ? "Available" : "Unavailable"}
      </span>
      <div className={styles.actions}>
        <Link
          href={`/seller/menu/${snack.id}`}
          className={styles.iconLink}
          aria-label={`Edit ${snack.name}`}
        >
          <Pencil size={15} strokeWidth={1.7} />
        </Link>
        <button
          type="button"
          className={clsx(styles.iconLink, styles.deleteButton)}
          onClick={() => onDelete?.(snack.id)}
          aria-label={`Delete ${snack.name}`}
        >
          <Trash2 size={15} strokeWidth={1.7} />
        </button>
      </div>
    </Card>
  );
}
