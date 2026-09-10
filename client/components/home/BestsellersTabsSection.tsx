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
 * Alternates food and craft products so the "All" view gives equal visibility to both.
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

export function BestsellersTabsSection({
  bestsellerFoodProducts = [],
  bestsellerCraftProducts = [],
  trendingFoodProducts = [],
  trendingCraftProducts = [],
  foodProducts,
  craftProducts,
  vendorNames,
}: BestsellersTabsSectionProps) {
  // Common category switch for both Bestsellers and Trending sections
  const [category, setCategory] = useState<CategoryKey>("all");

  const bsFood = bestsellerFoodProducts.length > 0 ? bestsellerFoodProducts : (foodProducts ?? []);
  const bsCraft = bestsellerCraftProducts.length > 0 ? bestsellerCraftProducts : (craftProducts ?? []);
  const trFood = trendingFoodProducts;
  const trCraft = trendingCraftProducts;

  const bsAll = useMemo(() => interleaveProducts(bsFood, bsCraft), [bsFood, bsCraft]);
  const trAll = useMemo(() => interleaveProducts(trFood, trCraft), [trFood, trCraft]);

  const bsDisplayed = useMemo(() => {
    if (category === "food") return bsFood;
    if (category === "craft") return bsCraft;
    return bsAll;
  }, [category, bsFood, bsCraft, bsAll]);

  const trDisplayed = useMemo(() => {
    if (category === "food") return trFood;
    if (category === "craft") return trCraft;
    return trAll;
  }, [category, trFood, trCraft, trAll]);

  const viewAllHref = category === "craft" ? "/gifts" : "/shop";
  const viewAllText =
    category === "food"
      ? "See all food →"
      : category === "craft"
        ? "Browse all gifts →"
        : "See all →";

  if (bsAll.length === 0 && trAll.length === 0) {
    return null;
  }

  return (
    <div className={styles.curatedWrapper}>
      {/* ── Single Common Category Switch for Both Sections ── */}
      <div className={clsx("container", "container-wide", styles.commonSwitcherContainer)}>
        <div className={styles.commonFilterPills} role="tablist" aria-label="Category filter">
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className={clsx(styles.pill, category === "all" && styles.pillActive)}
            onClick={() => setCategory("all")}
          >
            <Sparkles size={14} />
            <span>All</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "food"}
            className={clsx(styles.pill, category === "food" && styles.pillActive)}
            onClick={() => setCategory("food")}
          >
            <Utensils size={14} />
            <span>Homemade Food</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "craft"}
            className={clsx(styles.pill, category === "craft" && styles.pillActive)}
            onClick={() => setCategory("craft")}
          >
            <Gift size={14} />
            <span>Handcrafted Gifts</span>
          </button>
        </div>
      </div>

      {/* ── Section 1: Bestsellers ── */}
      {bsDisplayed.length > 0 && (
        <section className={clsx("container", "container-wide", styles.section)}>
          <div className={styles.sectionHead}>
            <div className={styles.headingBlock}>
              <span className={styles.eyebrow}>Loved by our community</span>
              <h2 className={styles.sectionTitle}>Bestsellers</h2>
            </div>
            <Link href={viewAllHref} className={styles.viewAll}>
              {viewAllText}
            </Link>
          </div>

          <ScrollRail label={`bestsellers — ${category}`} className={styles.productRail}>
            {bsDisplayed.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNames[product.vendorId] ?? "Homekrafted"}
                href={`/product/${product.slug}`}
              />
            ))}
          </ScrollRail>
        </section>
      )}

      {/* ── Section 2: Trending Now ── */}
      {trDisplayed.length > 0 && (
        <section
          className={clsx(
            "container",
            "container-wide",
            styles.section,
            styles.sectionTrending,
          )}
        >
          <div className={styles.sectionHead}>
            <div className={styles.headingBlock}>
              <span className={styles.eyebrow}>Fresh &amp; rising favorites</span>
              <h2 className={styles.sectionTitle}>Trending Now</h2>
            </div>
            <Link href={viewAllHref} className={styles.viewAll}>
              {viewAllText}
            </Link>
          </div>

          <ScrollRail label={`trending — ${category}`} className={styles.productRail}>
            {trDisplayed.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNames[product.vendorId] ?? "Homekrafted"}
                href={`/product/${product.slug}`}
              />
            ))}
          </ScrollRail>
        </section>
      )}
    </div>
  );
}
