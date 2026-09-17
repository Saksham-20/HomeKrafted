import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import { categoryTint } from "@/lib/category-tint";
import type { Category } from "@/lib/types";
import styles from "./CategoryTile.module.css";

export interface CategoryTileProps {
  category: Category;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function CategoryTile({ category, href, onClick, className }: CategoryTileProps) {
  const tint = categoryTint(category.id);
  const inner = (
    <div
      className={styles.cardFrame}
      style={{ "--tile-ground": tint.ground, "--tile-ink": tint.ink } as CSSProperties}
    >
      {/*
        A category draws its mark, never a photograph (owner, 2026-09-16).
        A photo on a category tile is one listing standing in for a whole
        shelf — it dates the moment that listing sells out, it makes the
        shelf look like the thing rather than the group, and half the
        shelves had no usable picture anyway so the row was half photos and
        half marks. The mark is the shelf's own identity, picked by an
        admin from the icon registry.

        The tint pair is a deterministic hash of the id (`lib/category-tint`,
        2026-09-17) — colour that tells shelves apart at a glance instead of
        the same sage-on-sage repeated fourteen times.

        `.label` used to be white with a photo drop-shadow, a leftover from
        when a photograph sat behind it. Fixed 2026-09-17: it measured
        ~1.1:1 on the tint it actually renders over (A1 in
        docs/UI-REFINEMENT.md) — every shelf name on the home rail was
        effectively invisible. It now takes the tint's own ink.
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
