"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { ActiveFilterBar, type ActiveFilterChip } from "@/components/browse/ActiveFilterBar";
import { BrowsePagination } from "@/components/browse/BrowsePagination";
import { FilterGroup } from "@/components/browse/FilterGroup";
import { MobileFilterSheet } from "@/components/browse/MobileFilterSheet";
import { SortSelect } from "@/components/browse/SortSelect";
import { useBrowseFilters } from "@/components/browse/useBrowseFilters";
import { PRODUCT_TAG_VALUES } from "@/lib/browse-params";
import { isOnSale, productMatchesFacets, SHIPPING_LABELS } from "@/lib/browse-facets";
import { listingPrice } from "@/lib/kitchens";
import type { Category, Occasion, Product } from "@/lib/types";
import styles from "./GiftsClient.module.css";

/** First grid row at the sidebar layout's widest — see ShopClient's note. */
const PRIORITY_CARDS = 3;

const PAGE_SIZE = 8;

const priceOf = listingPrice;

export interface GiftsClientProps {
  products: Product[];
  /** Craft-group categories only — the server page scopes them (M51's facet rule). */
  categories: Category[];
  occasions: Occasion[];
  vendorNameById: Record<string, string>;
  /** See `useBrowseFilters` — the server's query string, verbatim. */
  initialQuery: string;
}

/**
 * The craft vertical's browse machinery (M56). `/gifts` was a bare grid
 * with no filters, no sort and no URL state while `/shop` had all
 * three — composed here from the same `components/browse/` pieces, so
 * the two listing pages are one set of controls. No kitchens/dishes
 * switch (buying a candle is not a decision about who made it the way
 * ordering cooked food is — the M51 asymmetry, kept on purpose) and no
 * dietary facet (a craft has none).
 */
export function GiftsClient({
  products,
  categories,
  occasions,
  vendorNameById,
  initialQuery,
}: GiftsClientProps) {
  const priceBounds = useMemo(() => {
    if (products.length === 0) return [0, 0] as [number, number];
    const prices = products.map(priceOf);
    return [Math.min(...prices), Math.max(...prices)] as [number, number];
  }, [products]);

  const browse = useBrowseFilters({ categories, occasions, priceBounds, initialQuery });
  const {
    selectedCategories,
    setSelectedCategories,
    selectedOccasions,
    setSelectedOccasions,
    selectedTags,
    setSelectedTags,
    saleOnly,
    setSaleOnly,
    selectedShipping,
    setSelectedShipping,
    priceRange,
    setPriceRange,
    priceNarrowed,
    sort,
    setSort,
    page,
    setPage,
    toggle,
    clearFilters,
  } = browse;

  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(() => {
    const category = new Map<string, number>();
    const occasion = new Map<string, number>();
    const tag = new Map<string, number>();
    const shipping = new Map<string, number>();
    let sale = 0;
    for (const product of products) {
      category.set(product.categoryId, (category.get(product.categoryId) ?? 0) + 1);
      for (const id of product.occasionIds) occasion.set(id, (occasion.get(id) ?? 0) + 1);
      for (const t of product.tags) tag.set(t, (tag.get(t) ?? 0) + 1);
      const scope = product.shippingScope ?? "local";
      shipping.set(scope, (shipping.get(scope) ?? 0) + 1);
      if (isOnSale(product)) sale += 1;
    }
    return { category, occasion, tag, shipping, sale };
  }, [products]);

  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          productMatchesFacets(product, {
            categories: selectedCategories,
            occasions: selectedOccasions,
            dietary: new Set(),
            tags: selectedTags,
            sale: saleOnly,
            shipping: selectedShipping,
          }) &&
          priceOf(product) >= priceRange[0] &&
          priceOf(product) <= priceRange[1],
      ),
    [products, selectedCategories, selectedOccasions, selectedTags, saleOnly, selectedShipping, priceRange],
  );

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

  const hasDistance = useMemo(
    () => products.some((product) => product.distanceKm !== undefined),
    [products],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeChips: ActiveFilterChip[] = [
    ...[...selectedCategories].map((id) => ({
      key: `cat-${id}`,
      label: categories.find((c) => c.id === id)?.name ?? id,
      onRemove: () => toggle(selectedCategories, setSelectedCategories, id),
    })),
    ...[...selectedOccasions].map((id) => ({
      key: `occ-${id}`,
      label: occasions.find((o) => o.id === id)?.name ?? id,
      onRemove: () => toggle(selectedOccasions, setSelectedOccasions, id),
    })),
    ...[...selectedTags].map((tag) => ({
      key: `tag-${tag}`,
      label: tag,
      onRemove: () => toggle(selectedTags, setSelectedTags, tag),
    })),
    ...[...selectedShipping].map((scope) => ({
      key: `ship-${scope}`,
      label: SHIPPING_LABELS[scope],
      onRemove: () => toggle(selectedShipping, setSelectedShipping, scope),
    })),
    ...(saleOnly
      ? [
          {
            key: "sale",
            label: "On sale",
            onRemove: () => {
              setSaleOnly(false);
              setPage(1);
            },
          },
        ]
      : []),
  ];

  const activeCount = activeChips.length;

  /** Rendered twice — desktop aside + mobile sheet; only one is ever visible. */
  const filterControls = (
    <>
      <FilterGroup
        title="Category"
        options={categories.map((category) => ({
          id: category.id,
          label: category.name,
          count: counts.category.get(category.id) ?? 0,
          checked: selectedCategories.has(category.id),
        }))}
        onToggle={(id) => toggle(selectedCategories, setSelectedCategories, id)}
      />
      <FilterGroup
        title="Delivery"
        options={(["national", "local"] as const).map((scope) => ({
          id: scope,
          label: SHIPPING_LABELS[scope],
          count: counts.shipping.get(scope) ?? 0,
          checked: selectedShipping.has(scope),
        }))}
        onToggle={(id) =>
          toggle(selectedShipping, setSelectedShipping, id as "local" | "national")
        }
      />
      <FilterGroup
        title="Occasion"
        options={occasions.map((occasion) => ({
          id: occasion.id,
          label: occasion.name,
          count: counts.occasion.get(occasion.id) ?? 0,
          checked: selectedOccasions.has(occasion.id),
        }))}
        onToggle={(id) => toggle(selectedOccasions, setSelectedOccasions, id)}
      />
      <FilterGroup
        title="Picks"
        options={[
          ...PRODUCT_TAG_VALUES.map((tag) => ({
            id: tag as string,
            label: tag as string,
            count: counts.tag.get(tag) ?? 0,
            checked: selectedTags.has(tag),
          })),
          { id: "__sale", label: "On sale", count: counts.sale, checked: saleOnly },
        ]}
        onToggle={(id) => {
          if (id === "__sale") {
            setSaleOnly(!saleOnly);
            setPage(1);
            return;
          }
          toggle(selectedTags, setSelectedTags, id as (typeof PRODUCT_TAG_VALUES)[number]);
        }}
      />
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
    </>
  );

  // The pre-M56 "nothing listed yet" state, distinct from "your filters
  // matched nothing": one means the vertical is still filling, the other
  // means loosen a checkbox.
  if (products.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyLead}>No handcrafted gifts listed yet.</p>
        <p className={styles.emptyBody}>
          This side of Homekrafted is just opening. HomeKrafters are being onboarded now — in the
          meantime, the gift hampers are ready to send today.
        </p>
        <Link href="/hamper" className={styles.emptyLink}>
          Browse gift hampers →
        </Link>
      </div>
    );
  }

  return (
    <section className={clsx("container", styles.layout)}>
      <button
        type="button"
        className={styles.filterToggle}
        onClick={() => setSheetOpen(true)}
        aria-expanded={sheetOpen}
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      <aside className={styles.sidebar}>{filterControls}</aside>

      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        resultCount={sorted.length}
        onClearAll={activeCount > 0 || priceNarrowed ? clearFilters : undefined}
      >
        {filterControls}
      </MobileFilterSheet>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <span className={styles.resultCount}>
            {sorted.length} {sorted.length === 1 ? "gift" : "gifts"}
          </span>
          <ActiveFilterBar chips={activeChips} onClearAll={clearFilters} />
          <SortSelect value={sort} onChange={setSort} hasDistance={hasDistance} />
        </div>

        {sorted.length === 0 ? (
          <div className={styles.noMatch}>
            <p>
              {`Nothing matches ${activeChips.map((chip) => chip.label).join(" + ")}${
                priceNarrowed ? " in this price range" : ""
              }.`}
            </p>
            <p>Every filter narrows the same catalogue — loosen one and the gifts come back.</p>
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className={styles.grid}>
            {pageItems.map((product, index) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNameById[product.vendorId] ?? "Homekrafted"}
                href={`/product/${product.slug}`}
                priority={index < PRIORITY_CARDS}
              />
            ))}
          </div>
        )}

        <BrowsePagination totalPages={totalPages} currentPage={currentPage} onPageChange={setPage} />
      </div>
    </section>
  );
}
