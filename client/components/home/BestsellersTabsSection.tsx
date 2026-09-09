"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ScrollRail } from "@/components/ui/ScrollRail";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import type { Product } from "@/lib/types";
import styles from "./BestsellersTabsSection.module.css";

export interface BestsellersTabsSectionProps {
  foodProducts: Product[];
  craftProducts: Product[];
  vendorNames: Record<string, string>;
}

type TabKey = "all" | "food" | "craft";

export function BestsellersTabsSection({
  foodProducts,
  craftProducts,
  vendorNames,
}: BestsellersTabsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Interleave food and craft to preserve curated top rankings while alternating kind
  const allProducts = useMemo(() => {
    const list: Product[] = [];
    const maxLen = Math.max(foodProducts.length, craftProducts.length);
    for (let i = 0; i < maxLen; i++) {
      if (foodProducts[i]) list.push(foodProducts[i]);
      if (craftProducts[i]) list.push(craftProducts[i]);
    }
    return list;
  }, [foodProducts, craftProducts]);

  const displayedProducts = useMemo(() => {
    if (activeTab === "food") return foodProducts;
    if (activeTab === "craft") return craftProducts;
    return allProducts;
  }, [activeTab, foodProducts, craftProducts, allProducts]);

  if (foodProducts.length === 0 && craftProducts.length === 0) {
    return null;
  }

  const viewAllHref = activeTab === "craft" ? "/gifts" : "/shop";
  const viewAllText =
    activeTab === "food"
      ? "See all food →"
      : activeTab === "craft"
        ? "Browse all gifts →"
        : "See all →";

  return (
    <section className={clsx("container", "container-wide", styles.section)}>
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>Loved by our community</span>
          <h2 className={styles.sectionTitle}>Bestsellers</h2>
        </div>
        <Link href={viewAllHref} className={styles.viewAll}>
          {viewAllText}
        </Link>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Bestseller category filter">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={clsx(styles.tab, activeTab === "all" && styles.tabActive)}
          onClick={() => setActiveTab("all")}
        >
          <span>All</span>
          <span className={styles.tabCount}>({allProducts.length})</span>
        </button>

        {foodProducts.length > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "food"}
            className={clsx(styles.tab, activeTab === "food" && styles.tabActive)}
            onClick={() => setActiveTab("food")}
          >
            <span>Homemade Food</span>
            <span className={styles.tabCount}>({foodProducts.length})</span>
          </button>
        )}

        {craftProducts.length > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "craft"}
            className={clsx(styles.tab, activeTab === "craft" && styles.tabActive)}
            onClick={() => setActiveTab("craft")}
          >
            <span>Handcrafted Gifts</span>
            <span className={styles.tabCount}>({craftProducts.length})</span>
          </button>
        )}
      </div>

      <ScrollRail label={`bestsellers — ${activeTab}`} className={styles.productRail}>
        {displayedProducts.map((product) => (
          <ProductGridCard
            key={product.id}
            product={product}
            makerName={vendorNames[product.vendorId] ?? "Homekrafted"}
            href={`/product/${product.slug}`}
          />
        ))}
      </ScrollRail>
    </section>
  );
}
