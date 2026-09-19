"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Check, Sparkles, Leaf, Wheat, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { KitchenCard } from "@/components/kitchen/KitchenCard";
import { ActiveFilterBar, type ActiveFilterChip } from "@/components/browse/ActiveFilterBar";
import { BrowsePagination } from "@/components/browse/BrowsePagination";
import { FilterGroup, FilterOptionList } from "@/components/browse/FilterGroup";
import { FilterPillBar } from "@/components/browse/FilterPillBar";
import { MobileFilterSheet } from "@/components/browse/MobileFilterSheet";
import { QuickFilterChips } from "@/components/browse/QuickFilterChips";
import {
  categoryAncestry,
  expandShelfSelection,
  shelfCounts,
  splitCategorySections,
} from "@/lib/category-sections";
import { describeEmptyBrowse } from "@/lib/browse-empty";
import { SortSelect } from "@/components/browse/SortSelect";
import { useBrowseFilters } from "@/components/browse/useBrowseFilters";
import { PRODUCT_TAG_VALUES, type BrowseView } from "@/lib/browse-params";
import { compareFeatured } from "@/lib/featured-order";
import { buildKitchens, listingPrice, sortKitchens } from "@/lib/kitchens";
import { DIETARY_LABELS, DIETARY_OPTIONS, isOnSale, productMatchesFacets, SHIPPING_LABELS } from "@/lib/browse-facets";
import type { Category, Occasion, Product, Vendor } from "@/lib/types";
import styles from "./ShopClient.module.css";

/**
 * How many cards get `priority` — the leading cards of the first row,
 * which is where the LCP element lands.
 *
 * A single card is not enough: every card renders the same size, so which
 * one wins LCP is decided by paint order, and at 1280px Next named the
 * second one. Marking one card was a fix that happened to miss.
 *
 * Deliberately **not** raised to match the row (2026-09-05). The row went
 * from three cards to six when the page moved to `container-wide`, and
 * the sidebar this comment used to blame for the difference is gone
 * (M59b) — but priority is a *ranking*, and marking six is the same as
 * marking none (`ImageSlot`'s own rule). Three still covers whichever
 * card paints first at every width.
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

/**
 * Dishes page in 24s (2026-09-05, up from 6).
 *
 * 6 was two rows of three at the old 1092px content width. The grid now
 * runs six across on `container-wide`, so six was **one row** — a
 * paginator under a single line of cards, which reads as a catalogue
 * that has run out. 24 is four full rows at the widest and stays a
 * whole number of rows at every column count the grid produces (6, 4, 3,
 * 2), so no page ever ends on a ragged half-row.
 *
 * It is also inside the 24–48 band Baymard's product-list research puts
 * the sweet spot in, and well inside what one fetch already holds: the
 * page fetches 100 and filters client-side (M49), so a bigger page costs
 * no request.
 */
const PAGE_SIZE = 24;

/**
 * Kitchens page in nines, dishes in 24s. A kitchen card is much taller
 * than a product card but carries four listings of its own, so a smaller
 * number is roughly the same amount of catalogue per page.
 *
 * 8 until 2026-09-05, when the kitchen grid went from two columns to
 * three — eight is two rows plus an orphan, and the orphan reads as a
 * layout accident. Nine is three clean rows.
 */
const KITCHEN_PAGE_SIZE = 9;

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
    category,
    selectCategory,
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
    showAll,
  } = browse;

  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(() => {
    const occasion = new Map<string, number>();
    const dietary = new Map<string, number>();
    const tag = new Map<string, number>();
    const shipping = new Map<string, number>();
    let sale = 0;
    for (const product of products) {
      for (const id of product.occasionIds) occasion.set(id, (occasion.get(id) ?? 0) + 1);
      for (const t of product.dietary) dietary.set(t, (dietary.get(t) ?? 0) + 1);
      for (const t of product.tags) tag.set(t, (tag.get(t) ?? 0) + 1);
      const scope = product.shippingScope ?? "local";
      shipping.set(scope, (shipping.get(scope) ?? 0) + 1);
      if (isOnSale(product)) sale += 1;
    }
    // Every shelf a listing is filed under, not the primary alone (M58), and
    // a parent counts its whole family — see `shelfCounts`. A chip counting
    // only `categoryId` reads a smaller number than the catalogue holds.
    return { category: shelfCounts(products, categories), occasion, dietary, tag, shipping, sale };
  }, [products, categories]);

  /*
    The category is a scope, and a scope on a parent covers its children
    (D3, `expandShelfSelection`) — `/gifts` has done this since G3, and
    `/shop` did not: a parent slug from the header dropdown or a
    hand-written link matched only the listings filed directly on the
    parent, which is none of them, and read as an empty shelf.
  */
  const categoryScope = useMemo(
    () => expandShelfSelection(category ? [category] : [], categories),
    [category, categories],
  );

  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          productMatchesFacets(product, {
            categories: categoryScope,
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
      categoryScope,
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
      // The default: dishes an admin featured first, in the admin's order
      // (`compareFeatured` returns 0 on a tie), then the ordinary rating
      // ranking. Only here — an explicit price or "nearest" sort above is
      // the buyer's own question. The kitchens view gets the same lead
      // from `sortKitchens`.
      list.sort((a, b) => {
        const featuredOrder = compareFeatured(a, b);
        if (featuredOrder !== 0) return featuredOrder;
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.reviewCount - a.reviewCount;
      });
    /*
     * Deliverable dishes first, whatever the sort — the same rule the
     * kitchens view applies, and for the same reason: a dish that cannot
     * reach this address is not a result the same way one that can is, so
     * it never outranks one. Stable partition applied last, so the chosen
     * sort still orders within each half. `!== false` because absent means
     * the request never asked where the buyer is.
     */
    return [
      ...list.filter((p) => p.deliverable !== false),
      ...list.filter((p) => p.deliverable === false),
    ];
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

  /**
   * How many of the listed kitchens and dishes can actually reach this
   * buyer. Both numbers move with the location: with no area chosen
   * nothing is out of range and these equal the totals, which is the
   * honest answer — "we have not been told where you are" is not "far".
   */
  const deliverableKitchenCount = useMemo(
    () => kitchens.filter((kitchen) => kitchen.deliverable).length,
    [kitchens],
  );
  const deliverableDishCount = useMemo(
    () => sorted.filter((dish) => dish.deliverable !== false).length,
    [sorted],
  );
  const outOfRangeKitchens = kitchens.length - deliverableKitchenCount;

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

  /*
    Filters only — the category is deliberately not a chip. It is the scope
    the chips refine (the rail above shows and changes it), so counting it
    here made "All filters 3" and "Clear all" mean "two refinements and a
    shelf", and made Clear all throw away the shelf as well.
  */
  const activeChips: ActiveFilterChip[] = [
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

  const categorySplit = useMemo(() => splitCategorySections(categories), [categories]);

  /** The active category for the empty state's sentence, with its parent when it has one. */
  const categoryLabel = useMemo(() => {
    if (!category) return null;
    const chain = categoryAncestry(category, categories);
    const self = chain[chain.length - 1];
    if (!self) return null;
    return { name: self.name, parentName: chain.length > 1 ? chain[chain.length - 2].name : null };
  }, [category, categories]);

  // One set of option arrays feeds the pill popovers AND the sheet's
  // groups, so the two controls cannot drift apart.
  const dietaryFacets = DIETARY_OPTIONS.map((tag) => ({
    id: tag as string,
    label: DIETARY_LABELS[tag],
    count: counts.dietary.get(tag) ?? 0,
    checked: selectedDietary.has(tag),
  }));
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
  const onDietary = (id: string) =>
    toggle(selectedDietary, setSelectedDietary, id as (typeof DIETARY_OPTIONS)[number]);
  const onShipping = (id: string) =>
    toggle(selectedShipping, setSelectedShipping, id as "local" | "national");
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

  /*
    The "All filters" sheet — refinements only. It used to open with a
    Category group of checkboxes over the same state as the rail, which was
    two controls for one choice and, worse, a checkbox list for what is now
    a single-select scope. The rail is the one place a shelf is chosen.
  */
  const filterControls = (
    <>
      {/*
        The owner's framing (M56): some food is a craft in shipping terms.
        A jar of pickle or a tin of cookies survives a courier anywhere in
        the country; a thali or rajma chawal is cooked to be eaten within
        the hour. This facet is that split, straight off
        `Product.shippingScope`.
      */}
      <FilterGroup title="Delivery" options={shippingFacets} onToggle={onShipping} />
      <FilterGroup title="Dietary" options={dietaryFacets} onToggle={onDietary} />
      <FilterGroup
        title="Occasion"
        defaultOpen={selectedOccasions.size > 0}
        options={occasionFacets}
        onToggle={(id) => toggle(selectedOccasions, setSelectedOccasions, id)}
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

  /*
    The rail's shelves. A parent ("Shop by cuisine") is a heading and has no
    chip of its own — except when it *is* the selection (a header-dropdown
    or hand-written `?category=` link names one), where leaving it off would
    draw a rail with nothing chosen and not even "All" lit. It leads, so the
    highlight is where the eye lands.
  */
  const selectedParent = categorySplit.sections.find((section) => section.parent.id === category)?.parent;
  const categoryChips = [
    ...(selectedParent ? [selectedParent] : []),
    ...categorySplit.flat,
    ...categorySplit.sections.flatMap((section) => section.children),
  ]
    .map((shelf) => ({
      id: shelf.id,
      label: shelf.name,
      count: counts.category.get(shelf.id) ?? 0,
      icon: shelf.icon,
    }))
    // An empty shelf is not offered (a dead control), but the chosen one
    // stays so a link to it still shows where you are.
    .filter((chip) => chip.count > 0 || chip.id === category);

  const emptyCopy = describeEmptyBrowse({
    noun: isKitchens ? "kitchens" : "dishes",
    category: categoryLabel,
    filterLabels: activeChips.map((chip) => chip.label),
    priceNarrowed,
  });

  return (
    <section className={clsx("container", "container-wide", styles.layout)}>
      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        resultCount={resultCount}
        onClearAll={activeCount > 0 || priceNarrowed ? clearFilters : undefined}
      >
        {filterControls}
      </MobileFilterSheet>

      <div className={styles.main}>
        {/* The floating control card (M59b): category rail over the
            pill-filter bar, lifted over the hero's bottom edge — the
            whole filter surface in one place, catalogue full-width
            under it. The old 256px checkbox sidebar is gone. */}
        <div className={styles.controlCard}>
          {/*
            One shelf at a time (2026-09-19): a category is the scope, the
            chips and pills below are what refine it. "All" is the way out.
          */}
          <QuickFilterChips
            label="Category"
            chips={categoryChips}
            selectedId={category}
            onSelect={selectCategory}
            allCount={products.length}
          />
          {/*
            Refinements, not shelves — and drawn differently on purpose.
            This row sat directly under the category rail in the same pill
            language and the same solid selected state, so it read as a
            second row of categories (owner: "categories and filters are
            different"). It now has a hairline above it, a label, and its
            own selected grammar — a tinted pill with a check, the
            multi-select look — against the rail's solid tile.
          */}
          <div className={styles.quickFilters} role="group" aria-label="Quick filters">
            <span className={styles.quickFiltersLabel} aria-hidden="true">
              Quick filters
            </span>
            <div className={styles.taskChipsRail}>
              <TaskChip
                icon={Zap}
                active={selectedShipping.has("local")}
                onClick={() => toggle(selectedShipping, setSelectedShipping, "local")}
              >
                Delivered nearby
              </TaskChip>
              <TaskChip
                icon={Leaf}
                active={selectedDietary.has("vegetarian")}
                onClick={() => toggle(selectedDietary, setSelectedDietary, "vegetarian")}
              >
                Pure veg
              </TaskChip>
              <TaskChip
                icon={Wheat}
                active={selectedDietary.has("gluten-free") || selectedDietary.has("sugar-free")}
                onClick={() => {
                  const hasEither = selectedDietary.has("gluten-free") || selectedDietary.has("sugar-free");
                  const next = new Set(selectedDietary);
                  if (hasEither) {
                    next.delete("gluten-free");
                    next.delete("sugar-free");
                  } else {
                    next.add("gluten-free");
                    next.add("sugar-free");
                  }
                  setSelectedDietary(next);
                  setPage(1);
                }}
              >
                Sugar-free / gluten-free
              </TaskChip>
              {/*
                B4 (docs/UI-REFINEMENT.md): this used to say "Gift-Ready"
                over a gift emoji while filtering the `Curated` tag — a
                chip labelled as a property the data does not hold. Renamed
                to what it actually filters.
              */}
              <TaskChip
                icon={Sparkles}
                active={selectedTags.has("Curated")}
                onClick={() => toggle(selectedTags, setSelectedTags, "Curated")}
              >
                Curated picks
              </TaskChip>
            </div>
          </div>
          <div className={styles.controlRow}>
            {/*
              The food page's two shapes (M51). A radio group rather than
              two buttons or a link pair: it is one question with two
              answers, and a screen reader should hear "Browse by,
              kitchens, selected, 1 of 2" instead of two unrelated
              toggles.
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
              {/*
                The count is what DELIVERS when we know where the buyer is,
                with the rest named beside it. A single total would say 11
                to somebody who can order from 5, which is the number that
                matters to them; hiding the other 6 entirely was the
                previous behaviour and gave no way to tell a small
                catalogue from a filtered one.
              */}
              <span className={styles.viewCount}>
                {outOfRangeKitchens > 0 ? deliverableKitchenCount : kitchens.length}
              </span>
              {outOfRangeKitchens > 0 && (
                <span className={styles.viewCountMuted}>+{outOfRangeKitchens} further</span>
              )}
            </button>
              <button
                type="button"
                role="radio"
                aria-checked={!isKitchens}
                className={clsx(styles.viewBtn, !isKitchens && styles.viewBtnActive)}
                onClick={() => switchView("dishes")}
              >
                Dishes
                <span className={styles.viewCount}>
                  {deliverableDishCount < sorted.length ? deliverableDishCount : sorted.length}
                </span>
                {deliverableDishCount < sorted.length && (
                  <span className={styles.viewCountMuted}>
                    +{sorted.length - deliverableDishCount} further
                  </span>
                )}
              </button>
            </div>
            <FilterPillBar
              className={styles.pillBar}
              pills={[
                { key: "dietary", label: "Dietary", activeCount: selectedDietary.size, content: <FilterOptionList options={dietaryFacets} onToggle={onDietary} /> },
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

        {resultCount === 0 ? (
          /* The three-part empty state (M37): what happened, which
             shelf and filters caused it, and the way out. A bare "no
             products" over an active filter set reads as an empty
             catalogue — and since the category left the chips it has to
             be named here, or the sentence blames the wrong thing. Two
             exits: Clear filters keeps the shelf, Show all leaves it. */
          <div className={styles.empty}>
            <p>{emptyCopy.headline}</p>
            {emptyCopy.hint && <p>{emptyCopy.hint}</p>}
            {(emptyCopy.canClearFilters || emptyCopy.canShowAll) && (
              <div className={styles.emptyActions}>
                {emptyCopy.canClearFilters && (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
                {emptyCopy.canShowAll && (
                  <Button variant="secondary" size="sm" onClick={showAll}>
                    Show all {isKitchens ? "kitchens" : "dishes"}
                  </Button>
                )}
              </div>
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

/**
 * One of the "Quick filters" pills — a multi-select refinement, so it is an
 * `aria-pressed` toggle (unlike the category rail's radios) and its active
 * look swaps the mark for a check instead of filling solid.
 */
function TaskChip({
  icon: Mark,
  active,
  onClick,
  children,
}: {
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={clsx(styles.taskChip, active && styles.taskChipActive)}
      aria-pressed={active}
      onClick={onClick}
    >
      {active ? (
        <Check size={13} strokeWidth={3} aria-hidden="true" />
      ) : (
        <Mark size={13} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
