"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Sparkles, Utensils, Gift } from "lucide-react";
import { ScrollRail } from "@/components/ui/ScrollRail";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import type { Product } from "@/lib/types";
import styles from "./BestsellersTabsSection.module.css";

export interface BestsellersTabsSectionProps {
  bestsellerFoodProducts?: Product[];
  bestsellerCraftProducts?: Product[];
  trendingFoodProducts?: Product[];
  trendingCraftProducts?: Product[];
  foodProducts?: Product[];
  craftProducts?: Product[];
  vendorNames: Record<string, string>;
}

type CategoryKey = "all" | "food" | "craft";

/**
 * Alternates food and craft products so the "All" tab gives equal visibility to both.
 */
function interleaveProducts(food: Product[], craft: Product[]): Product[] {
  const list: Product[] = [];
  const maxLen = Math.max(food.length, craft.length);
  for (let i = 0; i < maxLen; i++) {
    if (food[i]) list.push(food[i]);
    if (craft[i]) list.push(craft[i]);
  }
  return list;
}

interface CuratedRailSectionProps {
  title: string;
  eyebrow: string;
  foodProducts: Product[];
  craftProducts: Product[];
  vendorNames: Record<string, string>;
  railId: string;
  variant?: "bestsellers" | "trending";
}

function CuratedRailSection({
  title,
  eyebrow,
  foodProducts,
  craftProducts,
  vendorNames,
  railId,
  variant = "bestsellers",
}: CuratedRailSectionProps) {
  const [category, setCategory] = useState<CategoryKey>("all");

  const allProducts = useMemo(
    () => interleaveProducts(foodProducts, craftProducts),
    [foodProducts, craftProducts],
  );

  const displayedProducts = useMemo(() => {
    if (category === "food") return foodProducts;
    if (category === "craft") return craftProducts;
    return allProducts;
  }, [category, foodProducts, craftProducts, allProducts]);

  if (allProducts.length === 0) {
    return null;
  }

  const foodCount = foodProducts.length;
  const craftCount = craftProducts.length;
  const allCount = allProducts.length;

  const showPills = foodCount > 0 && craftCount > 0;

  const viewAllHref = category === "craft" ? "/gifts" : "/shop";
  const viewAllText =
    category === "food"
      ? "See all food →"
      : category === "craft"
        ? "Browse all gifts →"
        : "See all →";

  return (
    <section
      className={clsx(
        "container",
        "container-wide",
        styles.section,
        variant === "trending" && styles.sectionTrending,
      )}
    >
      <div className={styles.sectionHead}>
        <div className={styles.headingBlock}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 className={styles.sectionTitle}>{title}</h2>
        </div>

        <Link href={viewAllHref} className={styles.viewAll}>
          {viewAllText}
        </Link>
      </div>

      {showPills && (
        <div
          className={styles.categoryPills}
          role="tablist"
          aria-label={`${title} category filter`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className={clsx(styles.pill, category === "all" && styles.pillActive)}
            onClick={() => setCategory("all")}
          >
            <Sparkles size={13} />
            <span>All</span>
            <span className={styles.pillCount}>({allCount})</span>
          </button>

          {foodCount > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={category === "food"}
              className={clsx(styles.pill, category === "food" && styles.pillActive)}
              onClick={() => setCategory("food")}
            >
              <Utensils size={13} />
              <span>Homemade Food</span>
              <span className={styles.pillCount}>({foodCount})</span>
            </button>
          )}

          {craftCount > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={category === "craft"}
              className={clsx(styles.pill, category === "craft" && styles.pillActive)}
              onClick={() => setCategory("craft")}
            >
              <Gift size={13} />
              <span>Handcrafted Gifts</span>
              <span className={styles.pillCount}>({craftCount})</span>
            </button>
          )}
        </div>
      )}

      <ScrollRail label={`${railId} — ${category}`} className={styles.productRail}>
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

export function BestsellersTabsSection({
  bestsellerFoodProducts = [],
  bestsellerCraftProducts = [],
  trendingFoodProducts = [],
  trendingCraftProducts = [],
  foodProducts,
  craftProducts,
  vendorNames,
}: BestsellersTabsSectionProps) {
  const bsFood = bestsellerFoodProducts.length > 0 ? bestsellerFoodProducts : (foodProducts ?? []);
  const bsCraft = bestsellerCraftProducts.length > 0 ? bestsellerCraftProducts : (craftProducts ?? []);
  const trFood = trendingFoodProducts;
  const trCraft = trendingCraftProducts;

  return (
    <>
      <CuratedRailSection
        title="Bestsellers"
        eyebrow="Loved by our community"
        foodProducts={bsFood}
        craftProducts={bsCraft}
        vendorNames={vendorNames}
        railId="bestsellers"
        variant="bestsellers"
      />

      {(trFood.length > 0 || trCraft.length > 0) && (
        <CuratedRailSection
          title="Trending Now"
          eyebrow="Fresh & rising favorites"
          foodProducts={trFood}
          craftProducts={trCraft}
          vendorNames={vendorNames}
          railId="trending"
          variant="trending"
        />
      )}
    </>
  );
}
