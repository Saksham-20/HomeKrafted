import clsx from "clsx";
import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { CraftIcon, categoryArt, giftArt } from "@/components/ui/icons/CraftIcon";
import type { Category } from "@/lib/types";
import styles from "./CategoryTile.module.css";

export interface CategoryTileProps {
  category: Category;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function CategoryTile({ category, href, onClick, className }: CategoryTileProps) {
  const inner = (
    <div className={styles.cardFrame}>
      {category.imageSrc ? (
        <ImageSlot
          ratio="3/4"
          shape="rect"
          label={category.imagePlaceholder}
          alt=""
          src={category.imageSrc}
          sizes="160px"
          className={styles.image}
        />
      ) : (
        <span className={styles.mark}>
          <CraftIcon art={categoryArt(category.slug) ?? giftArt} size={42} />
        </span>
      )}
      <div className={styles.scrim} aria-hidden="true" />
      <span className={styles.label}>{category.name}</span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={clsx(styles.tile, className)}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={clsx(styles.tile, className)} onClick={onClick}>
      {inner}
    </button>
  );
}
