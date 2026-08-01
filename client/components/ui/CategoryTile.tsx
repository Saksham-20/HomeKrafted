import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { Category } from "@/lib/types";
import styles from "./CategoryTile.module.css";

export interface CategoryTileProps {
  category: Category;
  onClick?: () => void;
  className?: string;
}

/** Category tile — circular 1:1 image + label, ported from "Shop by category". */
export function CategoryTile({ category, onClick, className }: CategoryTileProps) {
  return (
    <button
      type="button"
      className={clsx(styles.tile, className)}
      onClick={onClick}
    >
      <ImageSlot
        ratio="1/1"
        shape="circle"
        label={category.imagePlaceholder}
        // The category name is rendered right below, so the tile art is
        // decoration rather than something to announce twice.
        alt=""
        src={category.imageSrc}
        sizes="120px"
        compact
      />
      <span className={styles.label}>{category.name}</span>
    </button>
  );
}
