import clsx from "clsx";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
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
      {/*
        A category draws its mark, never a photograph (owner, 2026-09-16).
        A photo on a category tile is one listing standing in for a whole
        shelf — it dates the moment that listing sells out, it makes the
        shelf look like the thing rather than the group, and half the
        shelves had no usable picture anyway so the row was half photos and
        half marks. The mark is the shelf's own identity, picked by an
        admin from the icon registry.
      */}
      <span className={styles.mark}>
        <Icon id={category.icon} size={42} />
      </span>
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
