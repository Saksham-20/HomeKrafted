"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Sparkles, Utensils, Gift, Layers } from "lucide-react";
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

export type CategoryKey = "all" | "food" | "combos" | "craft";

/**
 * Checks if a product qualifies as a meal combo, bundle, set, or hamper.
 */
export function isComboProduct(product: Product): boolean {
  if (product.isHamper) return true;
  if (product.categoryId === "combos" || product.categoryIds?.includes("combos")) return true;
  if (product.tags?.some((t) => /combo|bundle|thali|set|box|hamper/i.test(t))) return true;
  return /combo|thali|bundle|box|set|hamper|pair/i.test(product.name);
}

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
  const [category, setCategory] = useState<CategoryKey>("all");

  const bsFood = useMemo(
    () => (bestsellerFoodProducts.length > 0 ? bestsellerFoodProducts : (foodProducts ?? [])),
    [bestsellerFoodProducts, foodProducts],
  );

  const bsCraft = useMemo(
    () => (bestsellerCraftProducts.length > 0 ? bestsellerCraftProducts : (craftProducts ?? [])),
    [bestsellerCraftProducts, craftProducts],
  );

  const trFood = trendingFoodProducts;
  const trCraft = trendingCraftProducts;

  const bsAll = useMemo(() => interleaveProducts(bsFood, bsCraft), [bsFood, bsCraft]);
  const trAll = useMemo(() => interleaveProducts(trFood, trCraft), [trFood, trCraft]);

  const bsCombos = useMemo(() => {
    const list = bsAll.filter(isComboProduct);
    // If not enough tagged items, pick popular multi-item or gift/sweets bundles
    if (list.length === 0) {
      return bsAll.filter((p) => /box|set|hamper|mix|pair/i.test(p.name));
    }
    return list;
  }, [bsAll]);

  const trCombos = useMemo(() => {
    const list = trAll.filter(isComboProduct);
    if (list.length === 0) {
      return trAll.filter((p) => /box|set|hamper|mix|pair/i.test(p.name));
    }
    return list;
  }, [trAll]);

  const bsDisplayed = useMemo(() => {
    if (category === "food") return bsFood;
    if (category === "combos") return bsCombos.length > 0 ? bsCombos : bsFood;
    if (category === "craft") return bsCraft;
    return bsAll;
  }, [category, bsFood, bsCombos, bsCraft, bsAll]);

  const trDisplayed = useMemo(() => {
    if (category === "food") return trFood;
    if (category === "combos") return trCombos.length > 0 ? trCombos : trFood;
    if (category === "craft") return trCraft;
    return trAll;
  }, [category, trFood, trCombos, trCraft, trAll]);

  const viewAllHref =
    category === "craft"
      ? "/gifts"
      : category === "combos"
        ? "/shop?q=combo"
        : "/shop";

  const viewAllText =
    category === "food"
      ? "See all food →"
      : category === "combos"
        ? "Explore combos & bundles →"
        : category === "craft"
          ? "Browse all gifts →"
          : "Explore collection →";

  if (bsAll.length === 0 && trAll.length === 0) {
    return null;
  }

  return (
    <div className={styles.curatedWrapper}>
      {/* ── Section 1: Bestsellers with Header-Integrated Segmented Toggle ── */}
      {bsDisplayed.length > 0 && (
        <section className={clsx("container", "container-wide", styles.section)}>
          <div className={styles.sectionHead}>
            <div className={styles.headingBlock}>
              <h2 className={styles.sectionTitle}>Bestsellers</h2>
            </div>

            {/* Segmented filter placed in the center */}
            <div className={styles.segmentedControlWrapper}>
              <div className={styles.segmentedControl} role="tablist" aria-label="Category filter">
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === "all"}
                  className={clsx(styles.segment, category === "all" && styles.segmentActive)}
                  onClick={() => setCategory("all")}
                >
                  <Sparkles size={13} className={styles.segmentIcon} aria-hidden="true" />
                  All
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === "food"}
                  className={clsx(styles.segment, category === "food" && styles.segmentActive)}
                  onClick={() => setCategory("food")}
                >
                  <Utensils size={13} className={styles.segmentIcon} aria-hidden="true" />
                  Food
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === "combos"}
                  className={clsx(styles.segment, category === "combos" && styles.segmentActive)}
                  onClick={() => setCategory("combos")}
                >
                  <Layers size={13} className={styles.segmentIcon} aria-hidden="true" />
                  Combos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === "craft"}
                  className={clsx(styles.segment, category === "craft" && styles.segmentActive)}
                  onClick={() => setCategory("craft")}
                >
                  <Gift size={13} className={styles.segmentIcon} aria-hidden="true" />
                  Gifts
                </button>
              </div>
            </div>

            <div className={styles.viewAllSlot}>
              <Link href={viewAllHref} className={styles.viewAll}>
                {viewAllText}
              </Link>
            </div>
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

      {/* Divider between sections */}
      {bsDisplayed.length > 0 && trDisplayed.length > 0 && (
        <div className={clsx("container", "container-wide", styles.dividerWrapper)}>
          <div className={styles.divider} />
        </div>
      )}

      {/* ── Section 2: Trending Now ── */}
      {trDisplayed.length > 0 && (
        <section className={clsx("container", "container-wide", styles.sectionTrending)}>
          <div className={styles.sectionHeadTrending}>
            <div className={styles.headingBlock}>
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
