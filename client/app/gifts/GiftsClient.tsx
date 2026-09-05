"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { ActiveFilterBar, type ActiveFilterChip } from "@/components/browse/ActiveFilterBar";
import { BrowsePagination } from "@/components/browse/BrowsePagination";
import { FilterGroup, FilterOptionList } from "@/components/browse/FilterGroup";
import { FilterPillBar } from "@/components/browse/FilterPillBar";
import { MobileFilterSheet } from "@/components/browse/MobileFilterSheet";
import { QuickFilterChips } from "@/components/browse/QuickFilterChips";
import { CATEGORY_EMOJI } from "@/lib/category-emoji";
import { splitCategorySections } from "@/lib/category-sections";
import { SortSelect } from "@/components/browse/SortSelect";
import { useBrowseFilters } from "@/components/browse/useBrowseFilters";
import { PRODUCT_TAG_VALUES } from "@/lib/browse-params";
import { isOnSale, productMatchesFacets, SHIPPING_LABELS } from "@/lib/browse-facets";
import { listingPrice } from "@/lib/kitchens";
import type { Category, Occasion, Product } from "@/lib/types";
import styles from "./GiftsClient.module.css";

/** The leading cards of the first row, where LCP lands — see ShopClient's note for why it is not the whole row. */
const PRIORITY_CARDS = 3;

/**
 * 24 (2026-09-05, up from 8). The grid runs six across on
 * `container-wide`, so eight was a full row plus a two-card orphan.
 * 24 divides evenly by every column count this grid produces (6, 4, 3,
 * 2), so no page ends ragged, and it is inside the 24–48 band Baymard's
 * product-list research points at. Costs no extra request: the page
 * fetches 100 and filters client-side (M49).
 */
const PAGE_SIZE = 24;

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
    // Same gap as /shop had (M59): the codec accepted ?sort=nearest and
    // this sorter ignored it. Absent distance sorts last.
    else if (sort === "nearest")
      list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
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

  const categorySplit = useMemo(() => splitCategorySections(categories), [categories]);
  const facetOf = (category: (typeof categories)[number]) => ({
    id: category.id,
    label: category.name,
    count: counts.category.get(category.id) ?? 0,
    checked: selectedCategories.has(category.id),
  });

  // One set of option arrays feeds the pill popovers AND the sheet.
  const shippingFacets = (["national", "local"] as const).map((scope) => ({
    id: scope as string,
    label: SHIPPING_LABELS[scope],
    count: counts.shipping.get(scope) ?? 0,
    checked: selectedShipping.has(scope),
  }));
  const occasionFacets = occasions.map((occasion) => ({
    id: occasion.id,
    label: occasion.name,
    count: counts.occasion.get(occasion.id) ?? 0,
    checked: selectedOccasions.has(occasion.id),
  }));
  const picksFacets = [
    ...PRODUCT_TAG_VALUES.map((tag) => ({
      id: tag as string,
      label: tag as string,
      count: counts.tag.get(tag) ?? 0,
      checked: selectedTags.has(tag),
    })),
    { id: "__sale", label: "On sale", count: counts.sale, checked: saleOnly },
  ];
  const onShipping = (id: string) =>
    toggle(selectedShipping, setSelectedShipping, id as "local" | "national");
  const onOccasion = (id: string) => toggle(selectedOccasions, setSelectedOccasions, id);
  const onPick = (id: string) => {
    if (id === "__sale") {
      setSaleOnly(!saleOnly);
      setPage(1);
      return;
    }
    toggle(selectedTags, setSelectedTags, id as (typeof PRODUCT_TAG_VALUES)[number]);
  };

  const pricePanel = (
    <div className={styles.pricePanel}>
      <div className={styles.pricePanelTitle}>Price</div>
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
  );

  /** The "All filters" sheet's contents. */
  const filterControls = (
    <>
      <FilterGroup
        title="Category"
        options={categorySplit.flat.map(facetOf)}
        sections={categorySplit.sections.map(({ parent, children }) => ({
          label: parent.name,
          options: children.map(facetOf),
        }))}
        onToggle={(id) => toggle(selectedCategories, setSelectedCategories, id)}
      />
      <FilterGroup title="Delivery" options={shippingFacets} onToggle={onShipping} />
      <FilterGroup
        title="Occasion"
        defaultOpen={selectedOccasions.size > 0}
        options={occasionFacets}
        onToggle={onOccasion}
      />
      <FilterGroup title="Picks" options={picksFacets} onToggle={onPick} />
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

  const categoryChips = [
    ...categorySplit.flat,
    ...categorySplit.sections.flatMap((section) => section.children),
  ].map((category) => ({
    id: category.id,
    label: category.name,
    count: counts.category.get(category.id) ?? 0,
    selected: selectedCategories.has(category.id),
    icon: CATEGORY_EMOJI[category.slug],
    imageSrc: category.imageSrc,
  }));

  return (
    <section className={clsx("container", "container-wide", styles.layout)}>
      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        resultCount={sorted.length}
        onClearAll={activeCount > 0 || priceNarrowed ? clearFilters : undefined}
      >
        {filterControls}
      </MobileFilterSheet>

      <div className={styles.main}>
        {/* The floating control card (M59b) — see ShopClient. */}
        <div className={styles.controlCard}>
          <QuickFilterChips
            label="Filter by category"
            chips={categoryChips}
            onToggle={(id) => toggle(selectedCategories, setSelectedCategories, id)}
          />
          <div className={styles.controlRow}>
            <span className={styles.resultCount}>
              {sorted.length} {sorted.length === 1 ? "gift" : "gifts"}
            </span>
            <FilterPillBar
              className={styles.pillBar}
              pills={[
                { key: "occasion", label: "Occasion", activeCount: selectedOccasions.size, content: <FilterOptionList options={occasionFacets} onToggle={onOccasion} /> },
                { key: "price", label: "Price", activeCount: priceNarrowed ? 1 : 0, content: pricePanel },
                { key: "delivery", label: "Delivery", activeCount: selectedShipping.size, content: <FilterOptionList options={shippingFacets} onToggle={onShipping} /> },
              ]}
              allFiltersCount={activeCount + (priceNarrowed ? 1 : 0)}
              onAllFilters={() => setSheetOpen(true)}
            />
            <SortSelect value={sort} onChange={setSort} hasDistance={hasDistance} />
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className={styles.chipsRow}>
            <ActiveFilterBar chips={activeChips} onClearAll={clearFilters} />
          </div>
        )}

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
