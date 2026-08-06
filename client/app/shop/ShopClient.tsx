"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Chip } from "@/components/ui/Chip";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import type { Category, DietaryTag, Occasion, Product } from "@/lib/types";
import styles from "./ShopClient.module.css";

export interface ShopClientProps {
  products: Product[];
  categories: Category[];
  occasions: Occasion[];
  vendorNameById: Record<string, string>;
  initialCategory?: string;
  initialOccasion?: string;
}

type SortKey = "most-loved" | "price-asc" | "price-desc";

const DIETARY_OPTIONS: DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "sugar-free",
  "contains-nuts",
];

const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-free",
  "sugar-free": "No added sugar",
  "contains-nuts": "Contains nuts",
};

const PAGE_SIZE = 6;

function priceOf(product: Product): number {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  return weight?.price ?? 0;
}

/**
 * Shop listing's interactive half: filter sidebar (category / dietary /
 * occasion checkboxes + PriceRange), sort, removable active-filter chips,
 * product grid and pagination — all client-side over the mock product
 * list (the real catalog is small enough in M2 that server-side filtering
 * isn't warranted yet; this is the seam that'll move server-side once a
 * real paginated API lands in M8). `initialCategory`/`initialOccasion`
 * (slugs) seed the starting selection from the server page's searchParams.
 */
export function ShopClient({
  products,
  categories,
  occasions,
  vendorNameById,
  initialCategory,
  initialOccasion,
}: ShopClientProps) {
  const initialCategoryId = categories.find((c) => c.slug === initialCategory)?.id;
  const initialOccasionId = occasions.find((o) => o.slug === initialOccasion)?.id;

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(initialCategoryId ? [initialCategoryId] : []),
  );
  const [selectedDietary, setSelectedDietary] = useState<Set<DietaryTag>>(() => new Set());
  const [selectedOccasions, setSelectedOccasions] = useState<Set<string>>(
    () => new Set(initialOccasionId ? [initialOccasionId] : []),
  );

  const priceBounds = useMemo(() => {
    const prices = products.map(priceOf);
    return [Math.min(...prices), Math.max(...prices)] as [number, number];
  }, [products]);
  const [priceRange, setPriceRange] = useState<[number, number]>(priceBounds);

  const [sort, setSort] = useState<SortKey>("most-loved");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const occasionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      for (const occasionId of product.occasionIds) {
        counts.set(occasionId, (counts.get(occasionId) ?? 0) + 1);
      }
    }
    return counts;
  }, [products]);

  const dietaryCounts = useMemo(() => {
    const counts = new Map<DietaryTag, number>();
    for (const product of products) {
      for (const tag of product.dietary) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [products]);

  function toggle<T>(set: Set<T>, setSet: (next: Set<T>) => void, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
    setPage(1);
  }

  const filtered = useMemo(() => {
    return products.filter((product) => {
      if (selectedCategories.size && !selectedCategories.has(product.categoryId)) return false;
      if (
        selectedDietary.size &&
        !product.dietary.some((tag) => selectedDietary.has(tag))
      )
        return false;
      if (
        selectedOccasions.size &&
        !product.occasionIds.some((id) => selectedOccasions.has(id))
      )
        return false;
      const price = priceOf(product);
      if (price < priceRange[0] || price > priceRange[1]) return false;
      return true;
    });
  }, [products, selectedCategories, selectedDietary, selectedOccasions, priceRange]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === "price-asc") list.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === "price-desc") list.sort((a, b) => priceOf(b) - priceOf(a));
    else
      list.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.reviewCount - a.reviewCount;
      });
    return list;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...[...selectedCategories].map((id) => ({
      key: `cat-${id}`,
      label: categories.find((c) => c.id === id)?.name ?? id,
      onRemove: () => toggle(selectedCategories, setSelectedCategories, id),
    })),
    ...[...selectedDietary].map((tag) => ({
      key: `diet-${tag}`,
      label: DIETARY_LABELS[tag],
      onRemove: () => toggle(selectedDietary, setSelectedDietary, tag),
    })),
    ...[...selectedOccasions].map((id) => ({
      key: `occ-${id}`,
      label: occasions.find((o) => o.id === id)?.name ?? id,
      onRemove: () => toggle(selectedOccasions, setSelectedOccasions, id),
    })),
  ];

  const activeCount = activeChips.length;

  return (
    <section className={clsx("container", styles.layout)}>
      <button
        type="button"
        className={styles.filterToggle}
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      <aside className={clsx(styles.sidebar, filtersOpen && styles.sidebarOpen)}>
        <div className={styles.filterGroup}>
          <div className={styles.filterTitle}>Category</div>
          {categories.map((category) => (
            <label key={category.id} className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selectedCategories.has(category.id)}
                onChange={() => toggle(selectedCategories, setSelectedCategories, category.id)}
              />
              {category.name}
              <span className={styles.count}>{categoryCounts.get(category.id) ?? 0}</span>
            </label>
          ))}
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterTitle}>Dietary</div>
          {DIETARY_OPTIONS.map((tag) => (
            <label key={tag} className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selectedDietary.has(tag)}
                onChange={() => toggle(selectedDietary, setSelectedDietary, tag)}
              />
              {DIETARY_LABELS[tag]}
              <span className={styles.count}>{dietaryCounts.get(tag) ?? 0}</span>
            </label>
          ))}
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterTitle}>Occasion</div>
          {occasions.map((occasion) => (
            <label key={occasion.id} className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selectedOccasions.has(occasion.id)}
                onChange={() => toggle(selectedOccasions, setSelectedOccasions, occasion.id)}
              />
              {occasion.name}
              <span className={styles.count}>{occasionCounts.get(occasion.id) ?? 0}</span>
            </label>
          ))}
        </div>

        <div className={styles.priceGroup}>
          <div className={styles.filterTitle}>Price</div>
          <PriceRange
            min={priceBounds[0]}
            max={priceBounds[1]}
            valueMin={priceRange[0]}
            valueMax={priceRange[1]}
            onChange={(range) => {
              setPriceRange(range);
              setPage(1);
            }}
          />
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <div className={styles.activeChips}>
            {activeChips.map((chip) => (
              <Chip key={chip.key} label={chip.label} selected onRemove={chip.onRemove} />
            ))}
          </div>
          <label className={styles.sortRow}>
            Sort
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortKey);
                setPage(1);
              }}
            >
              <option value="most-loved">Most loved</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
        </div>

        {pageItems.length === 0 ? (
          <p className={styles.empty}>No products match your filters.</p>
        ) : (
          <div className={styles.grid}>
            {pageItems.map((product, index) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNameById[product.vendorId] ?? "Homekrafted"}
                href={`/product/${product.slug}`}
                // The first row, not the first card. This grid is the top
                // of the page, so its LCP element is one of the row-one
                // cards — but every card renders at the same size, so
                // *which* one wins is decided by paint order and is not
                // stable: measured at 1280px, the warning named the second
                // card, not the first. Marking one card was therefore a
                // fix that happened to miss. Three is the desktop row
                // count; all three are above the fold and needed for first
                // paint anyway, so nothing is being fetched early that
                // wasn't already required.
                priority={index < 3}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={clsx(styles.pageBtn, pageNumber === currentPage && styles.pageActive)}
                onClick={() => setPage(pageNumber)}
                aria-current={pageNumber === currentPage ? "page" : undefined}
              >
                {pageNumber}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
