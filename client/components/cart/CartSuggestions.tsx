"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { Sparkles, Plus, Check } from "lucide-react";
import { getProducts, getVendors } from "@/lib/api";
import { useCart } from "@/lib/cart/CartContext";
import { purchasableSku } from "@/lib/cart/purchasable-sku";
import { formatCurrency } from "@/lib/format";
import type { Product, Vendor } from "@/lib/types";
import styles from "./CartSuggestions.module.css";

type TabKey = "all" | "cakes" | "combos" | "gifts";

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

function getBadge(p: Product): { text: string; className: string } {
  if (isCakeOrDessert(p)) return { text: "🍰 BAKE", className: styles.badgeCake };
  if (isComboOrMeal(p)) return { text: "🍱 COMBO", className: styles.badgeCombo };
  if (isGiftOrSurprise(p)) return { text: "🎁 GIFT", className: styles.badgeGift };
  return { text: "✨ SPECIAL", className: styles.badge };
}

export function CartSuggestions() {
  const { items, addItem, hampers } = useCart();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProducts(), getVendors()])
      .then(([prods, vends]) => {
        if (!cancelled) {
          setCatalog(prods);
          setVendors(vends);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const cartProductIds = useMemo(
    () => new Set(items.map((i) => i.productId).filter(Boolean)),
    [items]
  );

  const cartVendorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.productId) {
        const prod = catalog.find((p) => p.id === item.productId);
        if (prod?.vendorId) ids.add(prod.vendorId);
      }
      if (item.hamperId && hampers[item.hamperId]) {
        for (const hi of hampers[item.hamperId].items) {
          const prod = catalog.find((p) => p.id === hi.productId);
          if (prod?.vendorId) ids.add(prod.vendorId);
        }
      }
    }
    return ids;
  }, [items, catalog, hampers]);

  // Suggestions must ONLY come from the same kitchen(s) as the items in the cart
  const sameKitchenProducts = useMemo(() => {
    if (cartVendorIds.size === 0) return [];
    return catalog.filter((p) => cartVendorIds.has(p.vendorId) && !cartProductIds.has(p.id));
  }, [catalog, cartVendorIds, cartProductIds]);

  const kitchenName = useMemo(() => {
    if (cartVendorIds.size === 1) {
      const vendorId = Array.from(cartVendorIds)[0];
      const vendor = vendors.find((v) => v.id === vendorId);
      if (vendor?.name) return vendor.name;
    }
    return null;
  }, [cartVendorIds, vendors]);

  const cakeItems = useMemo(
    () => sameKitchenProducts.filter(isCakeOrDessert),
    [sameKitchenProducts]
  );
  const comboItems = useMemo(
    () => sameKitchenProducts.filter(isComboOrMeal),
    [sameKitchenProducts]
  );
  const giftItems = useMemo(
    () => sameKitchenProducts.filter(isGiftOrSurprise),
    [sameKitchenProducts]
  );

  const availableTabs = useMemo(() => {
    const tabs: { key: TabKey; label: string }[] = [
      { key: "all", label: "✨ All items" },
    ];
    if (cakeItems.length > 0) {
      tabs.push({ key: "cakes", label: "🍰 Cakes & Bakes" });
    }
    if (comboItems.length > 0) {
      tabs.push({ key: "combos", label: "🍱 Combos & Sides" });
    }
    if (giftItems.length > 0) {
      tabs.push({ key: "gifts", label: "🎁 Gifts & Craft" });
    }
    return tabs;
  }, [cakeItems.length, comboItems.length, giftItems.length]);

  const effectiveTab = availableTabs.some((t) => t.key === activeTab) ? activeTab : "all";

  const filtered = useMemo(() => {
    if (sameKitchenProducts.length === 0) return [];
    if (effectiveTab === "cakes") {
      return cakeItems.length > 0 ? cakeItems : sameKitchenProducts;
    }
    if (effectiveTab === "combos") {
      return comboItems.length > 0 ? comboItems : sameKitchenProducts;
    }
    if (effectiveTab === "gifts") {
      return giftItems.length > 0 ? giftItems : sameKitchenProducts;
    }
    return sameKitchenProducts;
  }, [sameKitchenProducts, effectiveTab, cakeItems, comboItems, giftItems]);

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
          <h2 className={styles.title}>
            {kitchenName ? `More from ${kitchenName}` : "More from this kitchen"}
          </h2>
        </div>
        {availableTabs.length > 1 && (
          <div className={styles.tabs} role="tablist" aria-label="Suggestions categories">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={effectiveTab === tab.key}
                className={clsx(styles.tab, effectiveTab === tab.key && styles.tabActive)}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.rail}>
        {filtered.slice(0, 10).map((product) => {
          const sku = purchasableSku(product);
          const weight =
            product.weightOptions.find((w) => w.sku === sku) ?? product.weightOptions[0];
          const isAdded = addedIds.has(product.id);
          const isAdding = addingId === product.id;
          const imageSrc = product.images?.[0]?.src || "/images/placeholder.jpg";
          const badge = getBadge(product);

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
                <span className={clsx(styles.badge, badge.className)}>
                  {badge.text}
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
