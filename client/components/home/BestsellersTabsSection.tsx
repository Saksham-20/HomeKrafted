"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Flame, TrendingUp, Sparkles, Utensils, Gift } from "lucide-react";
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

type ModeKey = "bestsellers" | "trending";
type CategoryKey = "all" | "food" | "craft";

export function BestsellersTabsSection({
  bestsellerFoodProducts = [],
  bestsellerCraftProducts = [],
  trendingFoodProducts = [],
  trendingCraftProducts = [],
  foodProducts,
  craftProducts,
  vendorNames,
}: BestsellersTabsSectionProps) {
  const [mode, setMode] = useState<ModeKey>("bestsellers");
  const [category, setCategory] = useState<CategoryKey>("all");

  const bsFood = bestsellerFoodProducts.length > 0 ? bestsellerFoodProducts : (foodProducts ?? []);
  const bsCraft = bestsellerCraftProducts.length > 0 ? bestsellerCraftProducts : (craftProducts ?? []);
  const trFood = trendingFoodProducts;
  const trCraft = trendingCraftProducts;

  // Interleave food and craft items to preserve top rankings while alternating category
  const interleave = (food: Product[], craft: Product[]) => {
    const list: Product[] = [];
    const maxLen = Math.max(food.length, craft.length);
    for (let i = 0; i < maxLen; i++) {
      if (food[i]) list.push(food[i]);
      if (craft[i]) list.push(craft[i]);
    }
    return list;
  };

  const bsAll = useMemo(() => interleave(bsFood, bsCraft), [bsFood, bsCraft]);
  const trAll = useMemo(() => interleave(trFood, trCraft), [trFood, trCraft]);

  const currentProducts = useMemo(() => {
    const isBs = mode === "bestsellers";
    const food = isBs ? bsFood : trFood;
    const craft = isBs ? bsCraft : trCraft;
    const all = isBs ? bsAll : trAll;

    if (category === "food") return food;
    if (category === "craft") return craft;
    return all;
  }, [mode, category, bsFood, bsCraft, bsAll, trFood, trCraft, trAll]);

  const activeFoodCount = mode === "bestsellers" ? bsFood.length : trFood.length;
  const activeCraftCount = mode === "bestsellers" ? bsCraft.length : trCraft.length;
  const activeAllCount = mode === "bestsellers" ? bsAll.length : trAll.length;

  if (bsAll.length === 0 && trAll.length === 0) {
    return null;
  }

  const hasTrending = trAll.length > 0;
  const viewAllHref = category === "craft" ? "/gifts" : "/shop";
  const viewAllText =
    category === "food"
      ? "See all food →"
      : category === "craft"
        ? "Browse all gifts →"
        : "See all →";

  return (
    <section className={clsx("container", "container-wide", styles.section)}>
      <div className={styles.sectionHead}>
        <div className={styles.headingBlock}>
          <span className={styles.eyebrow}>
            {mode === "bestsellers" ? "Loved by our community" : "Fresh & rising favorites"}
          </span>
          <h2 className={styles.sectionTitle}>
            {mode === "bestsellers" ? "Bestsellers" : "Trending Now"}
          </h2>
        </div>

        {/* Mode switcher (Bestsellers vs Trending) if both exist */}
        {hasTrending && (
          <div className={styles.modeSwitcher} role="tablist" aria-label="Curated collection">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "bestsellers"}
              className={clsx(styles.modeBtn, mode === "bestsellers" && styles.modeBtnActive)}
              onClick={() => {
                setMode("bestsellers");
                setCategory("all");
              }}
            >
              <Flame size={15} />
              <span>Bestsellers</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "trending"}
              className={clsx(styles.modeBtn, mode === "trending" && styles.modeBtnActive)}
              onClick={() => {
                setMode("trending");
                setCategory("all");
              }}
            >
              <TrendingUp size={15} />
              <span>Trending</span>
            </button>
          </div>
        )}

        <Link href={viewAllHref} className={styles.viewAll}>
          {viewAllText}
        </Link>
      </div>

      {/* Category Filter Pills: All / Food / Gifts */}
      <div className={styles.categoryPills} role="tablist" aria-label="Category filter">
        <button
          type="button"
          role="tab"
          aria-selected={category === "all"}
          className={clsx(styles.pill, category === "all" && styles.pillActive)}
          onClick={() => setCategory("all")}
        >
          <Sparkles size={13} />
          <span>All</span>
          <span className={styles.pillCount}>({activeAllCount})</span>
        </button>

        {activeFoodCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={category === "food"}
            className={clsx(styles.pill, category === "food" && styles.pillActive)}
            onClick={() => setCategory("food")}
          >
            <Utensils size={13} />
            <span>Homemade Food</span>
            <span className={styles.pillCount}>({activeFoodCount})</span>
          </button>
        )}

        {activeCraftCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={category === "craft"}
            className={clsx(styles.pill, category === "craft" && styles.pillActive)}
            onClick={() => setCategory("craft")}
          >
            <Gift size={13} />
            <span>Handcrafted Gifts</span>
            <span className={styles.pillCount}>({activeCraftCount})</span>
          </button>
        )}
      </div>

      {/* Product Scroll Rail */}
      <ScrollRail label={`${mode} — ${category}`} className={styles.productRail}>
        {currentProducts.map((product) => (
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
