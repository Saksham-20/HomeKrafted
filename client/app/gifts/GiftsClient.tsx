"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { ActiveFilterBar, type ActiveFilterChip } from "@/components/browse/ActiveFilterBar";
import { BrowsePagination } from "@/components/browse/BrowsePagination";
import { FilterGroup, FilterOptionList } from "@/components/browse/FilterGroup";
import { FilterPillBar } from "@/components/browse/FilterPillBar";
import { MobileFilterSheet } from "@/components/browse/MobileFilterSheet";
import { DepartmentTiles } from "@/components/gifts/DepartmentTiles";
import { GiftFinder, type FinderOption } from "@/components/gifts/GiftFinder";
import { giftFactLine } from "@/lib/gift/fact-line";
import { expandShelfSelection, shelfFamily, splitCategorySections } from "@/lib/category-sections";
import { sortGifts } from "@/lib/gift-sort";
import { SortSelect } from "@/components/browse/SortSelect";
import { useBrowseFilters } from "@/components/browse/useBrowseFilters";
import { isOnSale, productMatchesFacets, productShelves, SHIPPING_LABELS } from "@/lib/browse-facets";
import { listingPrice } from "@/lib/kitchens";
import type { Department } from "@/lib/api/catalog";
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

/**
 * The budget bands in the finder sentence.
 *
 * Fixed rather than derived from the catalogue: a band computed from
 * today's prices moves every time a maker lists something, so a shared
 * "under ₹1,000" link would mean something different next week. These are
 * the round numbers somebody actually thinks in.
 */
const BUDGETS: { value: string; label: string; max: number }[] = [
  { value: "500", label: "₹500", max: 500 },
  { value: "1000", label: "₹1,000", max: 1000 },
  { value: "2500", label: "₹2,500", max: 2500 },
  { value: "5000", label: "₹5,000", max: 5000 },
];

const priceOf = listingPrice;

export interface GiftsClientProps {
  products: Product[];
  /** Non-empty departments with their tile photo and subcategories (G1). */
  departments: Department[];
  /** The finder's recipient, filtered server-side — see `getCraftProducts`. */
  recipient: string;
  /** The options that recipient select offers, from `GET /catalog/facets`. */
  recipientOptions: FinderOption[];
  /** Craft-group categories only — the server page scopes them (M51's facet rule). */
  categories: Category[];
  occasions: Occasion[];
  /** Dated occasions close enough to lead the default sort — decided by the server page. */
  soonOccasionIds: string[];
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
  departments,
  recipient,
  recipientOptions,
  categories,
  occasions,
  soonOccasionIds,
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
  /*
    Dispatch and personalisable (§5.1.5).

    Both filter client-side over the fetched list, because `mapProduct`
    now carries `fulfilment` and `isPersonalisable` onto the card — unlike
    recipient, which is an attribute answer and has to go to the server.
    Neither is in `useBrowseFilters` yet: that hook is shared with `/shop`,
    where a thali has no dispatch mode.
  */
  const [selectedFulfilment, setSelectedFulfilment] = useState<Set<string>>(new Set());
  const [personalisableOnly, setPersonalisableOnly] = useState(false);

  const counts = useMemo(() => {
    const category = new Map<string, number>();
    const occasion = new Map<string, number>();
    const tag = new Map<string, number>();
    const shipping = new Map<string, number>();
    const fulfilment = new Map<string, number>();
    let personalisable = 0;
    let sale = 0;
    for (const product of products) {
      // NULL is "the maker never said" and counts toward neither mode —
      // never toward ready-to-ship, which would be the page promising a
      // dispatch nobody promised.
      if (product.fulfilment) {
        fulfilment.set(product.fulfilment, (fulfilment.get(product.fulfilment) ?? 0) + 1);
      }
      if (product.isPersonalisable) personalisable += 1;
      // Every shelf, not the primary alone (M58) — a chip counting only
      // `categoryId` reads a smaller number than the catalogue holds, and
      // a zero-count chip is dimmed AND disabled, so a shelf carrying only
      // secondary listings rendered as an unpressable "0".
      for (const shelf of productShelves(product)) {
        category.set(shelf, (category.get(shelf) ?? 0) + 1);
      }
      for (const id of product.occasionIds) occasion.set(id, (occasion.get(id) ?? 0) + 1);
      for (const t of product.tags) tag.set(t, (tag.get(t) ?? 0) + 1);
      const scope = product.shippingScope ?? "local";
      shipping.set(scope, (shipping.get(scope) ?? 0) + 1);
      if (isOnSale(product)) sale += 1;
    }
    // A parent counts every listing on itself or any child (D3), once each —
    // a listing on two children of one parent is one listing under it.
    for (const parent of categories.filter((c) => categories.some((child) => child.parentId === c.id))) {
      const family = new Set(shelfFamily(parent.id, categories));
      category.set(parent.id, products.filter((p) => productShelves(p).some((id) => family.has(id))).length);
    }
    return { category, occasion, tag, shipping, sale, fulfilment, personalisable };
  }, [products, categories]);

  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          productMatchesFacets(product, {
            // A selected parent matches its children too (D3).
            categories: expandShelfSelection(selectedCategories, categories),
            occasions: selectedOccasions,
            dietary: new Set(),
            tags: selectedTags,
            sale: saleOnly,
            shipping: selectedShipping,
          }) &&
          priceOf(product) >= priceRange[0] &&
          priceOf(product) <= priceRange[1] &&
          (selectedFulfilment.size === 0 ||
            (product.fulfilment !== undefined && selectedFulfilment.has(product.fulfilment))) &&
          (!personalisableOnly || product.isPersonalisable === true),
      ),
    [products, categories, selectedCategories, selectedOccasions, selectedTags, saleOnly, selectedShipping, priceRange, selectedFulfilment, personalisableOnly],
  );

  const soon = useMemo(() => new Set(soonOccasionIds), [soonOccasionIds]);
  // Sold out last in every sort; the default is "Recommended" (D9) — see
  // `lib/gift-sort.ts`.
  const sorted = useMemo(
    () => sortGifts(filtered, sort, { soonOccasionIds: soon, priceOf }),
    [filtered, sort, soon],
  );

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
    ...[...selectedFulfilment].map((mode) => ({
      key: `ful-${mode}`,
      label: mode === "ready_to_ship" ? "Ready to ship" : "Made to order",
      onRemove: () => onFulfilment(mode),
    })),
    ...(personalisableOnly
      ? [
          {
            key: "personalisable",
            label: "Personalisable",
            onRemove: () => {
              setPersonalisableOnly(false);
              setPage(1);
            },
          },
        ]
      : []),
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
  const hasItems = (option: { count: number; checked: boolean }) => option.count > 0 || option.checked;
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
  /*
    Dispatch, from `Product.fulfilment` (G1).

    Only the two answered modes are offered. There is deliberately no
    "not stated" row: it is not something a buyer wants, it is something
    we failed to ask, and a filter for it would put the gap in front of
    the wrong person. The count on each row says how many said so.
  */
  const fulfilmentFacets = (["ready_to_ship", "made_to_order"] as const).map((mode) => ({
    id: mode as string,
    label: mode === "ready_to_ship" ? "Ready to ship" : "Made to order",
    count: counts.fulfilment.get(mode) ?? 0,
    checked: selectedFulfilment.has(mode),
  }));

  const saleFacets = [{ id: "__sale", label: "On sale", count: counts.sale, checked: saleOnly }];
  const onShipping = (id: string) =>
    toggle(selectedShipping, setSelectedShipping, id as "local" | "national");
  const onOccasion = (id: string) => toggle(selectedOccasions, setSelectedOccasions, id);
  const onSale = () => {
    setSaleOnly(!saleOnly);
    setPage(1);
  };
  const onFulfilment = (id: string) => {
    setSelectedFulfilment((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
  };

  /** The "All filters" sheet's contents. */
  const filterControls = (
    <>
      <FilterGroup
        title="Category"
        options={categorySplit.flat.map(facetOf).filter(hasItems)}
        sections={categorySplit.sections.map(({ parent, children }) => ({
          label: parent.name,
          // The parent is its own first row, so a listing filed on it
          // directly is reachable (D3).
          options: [{ ...facetOf(parent), label: `All ${parent.name}` }, ...children.map(facetOf)].filter(hasItems),
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
      <FilterGroup
        title="Dispatch"
        defaultOpen={selectedFulfilment.size > 0}
        options={fulfilmentFacets}
        onToggle={onFulfilment}
      />
      <FilterGroup title="On sale" options={saleFacets} onToggle={onSale} />
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
    The department a buyer has opened, and the subcategory chips under it.

    Progressive disclosure, the buyer's side of the same rule the listing
    form follows (§5.1.3): nobody is shown eleven subcategory chips until
    they have said which department they are in. `openDepartment` is view
    state and stays out of the URL — what a shared link has to carry is
    which shelves are *selected*, which it already does.

    These three sit **above** the "nothing listed yet" early return below,
    with every other hook. Declared after it they were called only on the
    renders that got past it, so the first render with a catalogue called
    three more hooks than the empty one before it — "rendered more hooks
    than during the previous render", which is a crash, not a warning.
  */
  const router = useRouter();
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);

  /*
    Dated occasions first, each carrying its date, then the evergreen ones.

    `celebratedOn` is an absolute date, never a recurrence rule — Diwali
    lands on a different Gregorian date every year — so a passed one simply
    sorts last rather than being rolled forward by arithmetic here.
  */
  const occasionOptions: FinderOption[] = useMemo(() => {
    const withCount = occasions.filter((occasion) => (counts.occasion.get(occasion.id) ?? 0) > 0);
    const dated = withCount.filter((occasion) => occasion.celebratedOn);
    const evergreen = withCount.filter((occasion) => !occasion.celebratedOn);
    return [
      ...dated
        .slice()
        .sort((a, b) => (a.celebratedOn ?? "").localeCompare(b.celebratedOn ?? ""))
        .map((occasion) => ({ value: occasion.id, label: occasion.name })),
      ...evergreen.map((occasion) => ({ value: occasion.id, label: occasion.name })),
    ];
  }, [occasions, counts]);

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


  /* The finder's three answers, each one a real control and not a second copy of one. */
  const occasionValue = selectedOccasions.size === 1 ? [...selectedOccasions][0] : "";
  const budgetValue =
    BUDGETS.find((band) => priceRange[1] === band.max && priceRange[0] === priceBounds[0])?.value ?? "";

  function onFinderOccasion(value: string) {
    setSelectedOccasions(value ? new Set([value]) : new Set());
    setPage(1);
  }

  function onFinderBudget(value: string) {
    const band = BUDGETS.find((option) => option.value === value);
    setPriceRange(band ? [priceBounds[0], band.max] : priceBounds);
    setPage(1);
  }

  /*
    The recipient is the one control that reloads the page.

    It is an `AttributeDefinition` answer (G1) and `mapProduct` does not
    carry attribute values onto a card, so there is nothing in the fetched
    list to match it against client-side — it is filtered by the server and
    arrives as a new render. `replace`, not `push`, so choosing three
    recipients in a row does not fill the back button (the browse-params
    rule).
  */
  function onFinderRecipient(value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set("recipient", value);
    else params.delete("recipient");
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `/gifts?${query}` : "/gifts", { scroll: false });
  }

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
        {/*
          The finder sentence and the departments sit above the toolbar:
          they are the page's question and its shelves, and the toolbar is
          the narrowing you do once you have answered it.
        */}
        <GiftFinder
          recipients={recipientOptions}
          occasions={occasionOptions}
          budgets={BUDGETS}
          recipient={recipient}
          occasion={occasionValue}
          budget={budgetValue}
          onRecipient={onFinderRecipient}
          onOccasion={onFinderOccasion}
          onBudget={onFinderBudget}
        />

        <DepartmentTiles
          departments={departments}
          openId={openDepartment}
          onOpen={setOpenDepartment}
          selectedChildIds={selectedCategories}
          onToggleChild={(id) => {
            toggle(selectedCategories, setSelectedCategories, id);
          }}
        />

        {/*
          The toolbar sticks (§5.1.5). It carries the count, the dispatch
          and personalisable facets, All filters and the sort — but no
          occasion, recipient or price pill, because those three are the
          finder sentence above and two controls for one filter is how a
          page ends up disagreeing with itself.
        */}
        <div className={styles.toolbar}>
          <span className={styles.resultCount}>
            {sorted.length} {sorted.length === 1 ? "gift" : "gifts"}
          </span>
          <FilterPillBar
            className={styles.pillBar}
            pills={[
              {
                key: "dispatch",
                label: "Dispatch",
                activeCount: selectedFulfilment.size,
                content: <FilterOptionList options={fulfilmentFacets} onToggle={onFulfilment} />,
              },
              {
                key: "delivery",
                label: "Delivery",
                activeCount: selectedShipping.size,
                content: <FilterOptionList options={shippingFacets} onToggle={onShipping} />,
              },
            ]}
            allFiltersCount={activeCount + (priceNarrowed ? 1 : 0)}
            onAllFilters={() => setSheetOpen(true)}
          />
          {/*
            A toggle, not a pill with one checkbox in it: it has exactly two
            states and a dropdown to reach a single tick is a step for
            nothing. Disabled when nothing in the catalogue is
            personalisable, and it says so rather than silently emptying
            the grid.
          */}
          <button
            type="button"
            className={clsx(styles.toggle, personalisableOnly && styles.toggleOn)}
            aria-pressed={personalisableOnly}
            disabled={counts.personalisable === 0}
            title={counts.personalisable === 0 ? "No maker has offered personalisation yet" : undefined}
            onClick={() => {
              setPersonalisableOnly(!personalisableOnly);
              setPage(1);
            }}
          >
            Personalisable
            <span className={styles.toggleCount} aria-hidden="true">
              {counts.personalisable}
            </span>
          </button>
          <SortSelect value={sort} onChange={setSort} hasDistance={hasDistance} defaultLabel="Recommended" />
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
                factLine={giftFactLine(product)}
              />
            ))}
          </div>
        )}

        <BrowsePagination totalPages={totalPages} currentPage={currentPage} onPageChange={setPage} />
      </div>
    </section>
  );
}
