"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { Sparkles, Plus, Check } from "lucide-react";
import { getProducts } from "@/lib/api";
import { useCart } from "@/lib/cart/CartContext";
import { purchasableSku } from "@/lib/cart/purchasable-sku";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import styles from "./CartSuggestions.module.css";

type TabKey = "cakes" | "combos" | "gifts";

function isCakeOrDessert(p: Product): boolean {
  if (
    p.categoryId === "ct4" ||
    p.categoryId === "bakery" ||
    p.categoryId === "cakes-and-desserts" ||
    p.categoryId === "desserts"
  ) {
    return true;
  }
  return /cake|brownie|cookie|bake|sweet|ladoo|dessert|haldi doodh/i.test(p.name);
}

function isComboOrMeal(p: Product): boolean {
  if (p.isHamper || p.categoryId === "combos") return true;
  if (p.tags?.some((t) => /combo|bundle|thali|set|box/i.test(t))) return true;
  return /combo|thali|bundle|box|set|pair|pickle|chutney|mix/i.test(p.name);
}

function isGiftOrSurprise(p: Product): boolean {
  if (p.kind === "craft" || p.isHamper) return true;
  return /gift|hamper|candle|runner|mug|diya|jhumka|plant|toy|print/i.test(p.name);
}

export function CartSuggestions() {
  const { items, addItem } = useCart();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("cakes");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getProducts()
      .then((prods) => {
        if (!cancelled) setCatalog(prods);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const cartProductIds = useMemo(() => new Set(items.map((i) => i.productId)), [items]);

  const filtered = useMemo(() => {
    const unbought = catalog.filter((p) => !cartProductIds.has(p.id));
    if (activeTab === "cakes") {
      const list = unbought.filter(isCakeOrDessert);
      return list.length > 0 ? list : unbought.filter((p) => p.kind !== "craft");
    }
    if (activeTab === "combos") {
      const list = unbought.filter(isComboOrMeal);
      return list.length > 0 ? list : unbought;
    }
    // gifts
    const list = unbought.filter(isGiftOrSurprise);
    return list.length > 0 ? list : unbought.filter((p) => p.kind === "craft" || p.isHamper);
  }, [catalog, cartProductIds, activeTab]);

  async function handleAdd(product: Product) {
    const sku = purchasableSku(product);
    if (!sku) return;
    setAddingId(product.id);
    try {
      await addItem(product.id, sku, 1);
      setAddedIds((prev) => new Set([...prev, product.id]));
      setTimeout(() => {
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }, 2500);
    } catch {
      // Catch add error silently on quick add
    } finally {
      setAddingId(null);
    }
  }

  if (filtered.length === 0) return null;

  return (
    <section className={styles.container} aria-label="Order suggestions">
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Sparkles className={styles.sparkleIcon} size={15} aria-hidden="true" />
          <h2 className={styles.title}>Complete your order</h2>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Suggestions categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "cakes"}
            className={clsx(styles.tab, activeTab === "cakes" && styles.tabActive)}
            onClick={() => setActiveTab("cakes")}
          >
            🍰 Cakes & Bakes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "combos"}
            className={clsx(styles.tab, activeTab === "combos" && styles.tabActive)}
            onClick={() => setActiveTab("combos")}
          >
            🍱 Combos & Sides
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "gifts"}
            className={clsx(styles.tab, activeTab === "gifts" && styles.tabActive)}
            onClick={() => setActiveTab("gifts")}
          >
            🎁 Gifts & Surprise
          </button>
        </div>
      </div>

      <div className={styles.rail}>
        {filtered.slice(0, 10).map((product) => {
          const sku = purchasableSku(product);
          const weight =
            product.weightOptions.find((w) => w.sku === sku) ?? product.weightOptions[0];
          const isAdded = addedIds.has(product.id);
          const isAdding = addingId === product.id;
          const imageSrc = product.images?.[0]?.src || "/images/placeholder.jpg";

          return (
            <div key={product.id} className={styles.card}>
              <div className={styles.imageWrap}>
                <Image
                  src={imageSrc}
                  alt={product.name}
                  width={140}
                  height={140}
                  className={styles.thumb}
                />
                <span className={styles.badge}>
                  {activeTab === "cakes"
                    ? "🍰 BAKE"
                    : activeTab === "combos"
                      ? "🍱 COMBO"
                      : "🎁 GIFT"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.prodName} title={product.name}>
                  {product.name}
                </span>
                <div className={styles.priceRow}>
                  <span className={styles.price}>{formatCurrency(weight?.price ?? 199)}</span>
                  {weight?.label && <span className={styles.weight}>{weight.label}</span>}
                </div>
                <button
                  type="button"
                  className={clsx(styles.addBtn, isAdded && styles.addBtnSuccess)}
                  onClick={() => handleAdd(product)}
                  disabled={isAdding || !sku}
                  aria-label={`Add ${product.name} to cart`}
                >
                  {isAdded ? (
                    <>
                      <Check size={12} strokeWidth={2.6} />
                      <span>ADDED</span>
                    </>
                  ) : (
                    <>
                      <Plus size={12} strokeWidth={2.6} />
                      <span>{isAdding ? "…" : "ADD"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
