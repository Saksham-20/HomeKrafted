"use client";

import { useState } from "react";
import clsx from "clsx";
import { ReviewList } from "@/components/review/ReviewList";
import type { Product, Review } from "@/lib/types";
import styles from "./ProductTabs.module.css";

export interface ProductTabsProps {
  product: Product;
  reviews: Review[];
}

/**
 * Description tabs + spec table, ported from the prototype's product-detail
 * tab row. Two working tabs: "Description" (copy + spec k/v list, side by
 * side on desktop) and "Reviews" (the `ReviewList` — the prototype doesn't
 * show reviews at all, so this tab is a genuine M2 addition per the brief).
 */
export function ProductTabs({ product, reviews }: ProductTabsProps) {
  const [tab, setTab] = useState<"description" | "reviews">("description");

  const specs: { k: string; v: string }[] = [
    product.ingredients && { k: "Ingredients", v: product.ingredients },
    product.shelfLife && { k: "Shelf life", v: product.shelfLife },
    product.storageInstructions && { k: "Storage", v: product.storageInstructions },
    product.madeIn && { k: "Made in", v: product.madeIn },
  ].filter((row): row is { k: string; v: string } => Boolean(row));

  return (
    <div className={styles.wrap}>
      <div className={styles.tabRow}>
        <button
          type="button"
          className={clsx(styles.tab, tab === "description" && styles.tabActive)}
          onClick={() => setTab("description")}
        >
          Description
        </button>
        <button
          type="button"
          className={clsx(styles.tab, tab === "reviews" && styles.tabActive)}
          onClick={() => setTab("reviews")}
        >
          Reviews ({reviews.length})
        </button>
      </div>

      {tab === "description" ? (
        <div className={styles.descGrid}>
          <p className={styles.desc}>{product.description}</p>
          {specs.length > 0 && (
            <div className={styles.specs}>
              {specs.map((row) => (
                <div key={row.k} className={styles.specRow}>
                  <span className={styles.specKey}>{row.k}</span>
                  <span className={styles.specValue}>{row.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ReviewList reviews={reviews} emptyLabel="No reviews yet — be the first to review this product." />
      )}
    </div>
  );
}
