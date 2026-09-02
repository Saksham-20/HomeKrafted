"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { KitchenCard } from "@/components/kitchen/KitchenCard";
import { ActiveFilterBar, type ActiveFilterChip } from "@/components/browse/ActiveFilterBar";
import { BrowsePagination } from "@/components/browse/BrowsePagination";
import { FilterGroup } from "@/components/browse/FilterGroup";
import { MobileFilterSheet } from "@/components/browse/MobileFilterSheet";
import { QuickFilterChips } from "@/components/browse/QuickFilterChips";
import { splitCategorySections } from "@/lib/category-sections";
import { SortSelect } from "@/components/browse/SortSelect";
import { useBrowseFilters } from "@/components/browse/useBrowseFilters";
import { PRODUCT_TAG_VALUES, type BrowseView } from "@/lib/browse-params";
import { buildKitchens, listingPrice, sortKitchens } from "@/lib/kitchens";
import { isOnSale, productMatchesFacets, DIETARY_LABELS, DIETARY_OPTIONS, SHIPPING_LABELS } from "@/lib/browse-facets";
import type { Category, Occasion, Product, Vendor } from "@/lib/types";
import styles from "./ShopClient.module.css";

/**
 * How many cards get `priority` — the first row at the widest layout this
 * grid reaches. Three here, not five like the sidebar-less grids, because
 * this page gives a column to filters; measured at 1280px.
 *
 * A single card is not enough: every card renders the same size, so which
 * one wins LCP is decided by paint order, and at 1280px Next named the
 * second one. Marking one card was a fix that happened to miss.
 */
const PRIORITY_CARDS = 3;

export interface ShopClientProps {
  products: Product[];
  categories: Category[];
  occasions: Occasion[];
  /**
   * Every kitchen, so the default view can be built from the listings
   * already fetched (M51). There is no `GET /kitchens` — see
   * `lib/kitchens.ts` for why deriving beats adding one.
   */
  vendors: Vendor[];
  vendorNameById: Record<string, string>;
  /** See `useBrowseFilters` — the server's query string, verbatim. */
  initialQuery: string;
}

const PAGE_SIZE = 6;

/**
 * Kitchens page in eights, dishes in sixes. A kitchen card is taller than
 * a product card but carries four listings of its own, so eight of them
 * is roughly the same amount of catalogue per page.
 */
const KITCHEN_PAGE_SIZE = 8;

/** Shared with the kitchen cards so a "from ₹220" and the dish card under it cannot disagree. */
const priceOf = listingPrice;

/**
 * Shop listing's interactive half (recomposed over `components/browse/`
 * in M56): filter sidebar — and the same controls in a bottom sheet
 * below 900px — sort, removable active-filter chips, the kitchens/dishes
 * switch, grid and pagination. All filtering stays a client-side
 * `useMemo` over the already-loaded list (M49: instant, so a spinner
 * here would be theatre); the URL machinery lives in `useBrowseFilters`.
 */
export function ShopClient({
  products,
  categories,
  occasions,
  vendors,
  vendorNameById,
  initialQuery,
}: ShopClientProps) {
  const priceBounds = useMemo(() => {
    const prices = products.map(priceOf);
    return [Math.min(...prices), Math.max(...prices)] as [number, number];
  }, [products]);

  const browse = useBrowseFilters({ categories, occasions, priceBounds, initialQuery });
  const {
    selectedCategories,
    setSelectedCategories,
    selectedDietary,
    setSelectedDietary,
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
    view,
    setView,
    page,
    setPage,
    toggle,
    clearFilters,
  } = browse;

  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(() => {
    const category = new Map<string, number>();
    const occasion = new Map<string, number>();
    const dietary = new Map<string, number>();
    const tag = new Map<string, number>();
    const shipping = new Map<string, number>();
    let sale = 0;
    for (const product of products) {
      category.set(product.categoryId, (category.get(product.categoryId) ?? 0) + 1);
      for (const id of product.occasionIds) occasion.set(id, (occasion.get(id) ?? 0) + 1);
      for (const t of product.dietary) dietary.set(t, (dietary.get(t) ?? 0) + 1);
      for (const t of product.tags) tag.set(t, (tag.get(t) ?? 0) + 1);
      const scope = product.shippingScope ?? "local";
      shipping.set(scope, (shipping.get(scope) ?? 0) + 1);
      if (isOnSale(product)) sale += 1;
    }
    return { category, occasion, dietary, tag, shipping, sale };
  }, [products]);

  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          productMatchesFacets(product, {
            categories: selectedCategories,
            occasions: selectedOccasions,
            dietary: selectedDietary,
            tags: selectedTags,
            sale: saleOnly,
            shipping: selectedShipping,
          }) &&
          priceOf(product) >= priceRange[0] &&
          priceOf(product) <= priceRange[1],
      ),
    [
      products,
      selectedCategories,
      selectedDietary,
      selectedOccasions,
      selectedTags,
      saleOnly,
      selectedShipping,
      priceRange,
    ],
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === "price-asc") list.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === "price-desc") list.sort((a, b) => priceOf(b) - priceOf(a));
    // "Nearest" was in the URL codec and the kitchens sorter but not
    // here, so ?sort=nearest on the dishes view silently sorted by
    // rating (M59). Absent distance sorts last — "we were not told
    // where you are", never "far".
    else if (sort === "nearest")
      list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    else
      list.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.reviewCount - a.reviewCount;
      });
    return list;
  }, [filtered, sort]);

  /**
   * The kitchens view is grouped out of the **filtered** listings, not out
   * of the whole catalogue: a kitchen appears when it has something that
   * matches, and the four dishes on its card are four of the matches. Tick
   * "Pickles" and the cards keep showing the kitchen's pickles rather than
   * whatever it happens to be best rated for — a preview that ignored the
   * filter would send people into storefronts that do not sell what they
   * ticked.
   */
  const kitchens = useMemo(
    () => sortKitchens(buildKitchens(filtered, vendors, categories), sort),
    [filtered, vendors, categories, sort],
  );

  const isKitchens = view === "kitchens";

  const hasDistance = useMemo(
    () => products.some((product) => product.distanceKm !== undefined),
    [products],
  );

  const pageSize = isKitchens ? KITCHEN_PAGE_SIZE : PAGE_SIZE;
  const resultCount = isKitchens ? kitchens.length : sorted.length;
  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const kitchenPageItems = kitchens.slice(
    (currentPage - 1) * KITCHEN_PAGE_SIZE,
    currentPage * KITCHEN_PAGE_SIZE,
  );

  function switchView(next: BrowseView) {
    setView(next);
    // Page 3 of the dishes is not page 3 of the kitchens, and landing on
    // an empty page reads as the filters having eaten the catalogue.
    setPage(1);
  }

  const activeChips: ActiveFilterChip[] = [
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

  /**
   * Rendered twice — the desktop `<aside>` and the mobile sheet show the
   * same controls, and only one of the two is ever visible (the aside is
   * `display: none` below 900px; the closed sheet is `visibility:
   * hidden`), so the duplicate never doubles the tab order.
   */
  const categorySplit = useMemo(() => splitCategorySections(categories), [categories]);
  const facetOf = (category: (typeof categories)[number]) => ({
    id: category.id,
    label: category.name,
    count: counts.category.get(category.id) ?? 0,
    checked: selectedCategories.has(category.id),
  });

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
      {/*
        The owner's framing (M56): some food is a craft in shipping terms.
        A jar of pickle or a tin of cookies survives a courier anywhere in
        the country; a thali or rajma chawal is cooked to be eaten within
        the hour. This facet is that split, straight off
        `Product.shippingScope`.
      */}
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
        title="Dietary"
        options={DIETARY_OPTIONS.map((tag) => ({
          id: tag,
          label: DIETARY_LABELS[tag],
          count: counts.dietary.get(tag) ?? 0,
          checked: selectedDietary.has(tag),
        }))}
        onToggle={(id) => toggle(selectedDietary, setSelectedDietary, id as (typeof DIETARY_OPTIONS)[number])}
      />
      <FilterGroup
        title="Occasion"
        defaultOpen={selectedOccasions.size > 0}
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
          {
            id: "__sale",
            label: "On sale",
            count: counts.sale,
            checked: saleOnly,
          },
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

  const categoryChips = [
    ...categorySplit.flat,
    ...categorySplit.sections.flatMap((section) => section.children),
  ].map((category) => ({
    id: category.id,
    label: category.name,
    count: counts.category.get(category.id) ?? 0,
    selected: selectedCategories.has(category.id),
  }));

  return (
    <section className={clsx("container", styles.layout)}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <span className={styles.sidebarTitle}>Filters</span>
          {(activeCount > 0 || priceNarrowed) && (
            <button type="button" className={styles.sidebarClear} onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>
        {filterControls}
      </aside>

      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        resultCount={resultCount}
        onClearAll={activeCount > 0 || priceNarrowed ? clearFilters : undefined}
      >
        {filterControls}
      </MobileFilterSheet>

      <div className={styles.main}>
        {/* One-tap categories over the grid; same toggle() as the
            sidebar's checkboxes, so the rail and the checklist are one
            state, not two filters. */}
        <QuickFilterChips
          label="Filter by category"
          chips={categoryChips}
          onToggle={(id) => toggle(selectedCategories, setSelectedCategories, id)}
        />

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.filterToggle}
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
          >
            <SlidersHorizontal size={15} strokeWidth={2} aria-hidden />
            Filters
            {activeCount > 0 && <span className={styles.filterBadge}>{activeCount}</span>}
          </button>
          {/*
            The food page's two shapes (M51). A radio group rather than
            two buttons or a link pair: it is one question with two
            answers, and a screen reader should hear "Browse by, kitchens,
            selected, 1 of 2" instead of two unrelated toggles.
          */}
          <div className={styles.viewSwitch} role="radiogroup" aria-label="Browse by">
            <button
              type="button"
              role="radio"
              aria-checked={isKitchens}
              className={clsx(styles.viewBtn, isKitchens && styles.viewBtnActive)}
              onClick={() => switchView("kitchens")}
            >
              Kitchens
              <span className={styles.viewCount}>{kitchens.length}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isKitchens}
              className={clsx(styles.viewBtn, !isKitchens && styles.viewBtnActive)}
              onClick={() => switchView("dishes")}
            >
              Dishes
              <span className={styles.viewCount}>{sorted.length}</span>
            </button>
          </div>
          <SortSelect value={sort} onChange={setSort} hasDistance={hasDistance} />
        </div>

        {activeChips.length > 0 && (
          <div className={styles.chipsRow}>
            <ActiveFilterBar chips={activeChips} onClearAll={clearFilters} />
          </div>
        )}

        {resultCount === 0 ? (
          /* The three-part empty state (M37): what happened, which
             filters caused it, and the way out. A bare "no products"
             over an active filter set reads as an empty catalogue. */
          <div className={styles.empty}>
            <p>
              {activeCount > 0
                ? `Nothing matches ${activeChips.map((chip) => chip.label).join(" + ")}${
                    priceNarrowed ? " in this price range" : ""
                  }.`
                : "Nothing matches this view."}
            </p>
            <p>Every filter narrows the same catalogue — loosen one and the kitchens come back.</p>
            {(activeCount > 0 || priceNarrowed) && (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : isKitchens ? (
          <div className={styles.kitchenGrid}>
            {kitchenPageItems.map((kitchen, index) => (
              <KitchenCard key={kitchen.vendor.id} kitchen={kitchen} priority={index === 0} />
            ))}
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
