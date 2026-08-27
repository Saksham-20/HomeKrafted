"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { KitchenCard } from "@/components/kitchen/KitchenCard";
import {
  browseParamsToQuery,
  parseBrowseParams,
  type BrowseParams,
  type BrowseSortKey,
  type BrowseView,
} from "@/lib/browse-params";
import { buildKitchens, listingPrice, sortKitchens } from "@/lib/kitchens";
import type { Category, DietaryTag, Occasion, Product, Vendor } from "@/lib/types";
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
  /**
   * The page's own query string, as the Server Component saw it. Passed
   * rather than read from `useSearchParams()` so the server's first render
   * and the client's hydration decode the same URL — reading it only on
   * the client makes `/shop?sort=price-asc` render unsorted and then
   * re-order itself.
   */
  initialQuery: string;
}

type SortKey = BrowseSortKey;

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

/**
 * Kitchens page in eights, dishes in sixes. A kitchen card is taller than
 * a product card but carries four listings of its own, so eight of them
 * is roughly the same amount of catalogue per page.
 */
const KITCHEN_PAGE_SIZE = 8;

/** Shared with the kitchen cards so a "from ₹220" and the dish card under it cannot disagree. */
const priceOf = listingPrice;

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
  vendors,
  vendorNameById,
  initialQuery,
}: ShopClientProps) {
  const priceBounds = useMemo(() => {
    const prices = products.map(priceOf);
    return [Math.min(...prices), Math.max(...prices)] as [number, number];
  }, [products]);

  /**
   * Slugs are what the URL carries and ids are what the filters hold, so
   * every read and write crosses this. Slugs, not ids: `?category=pickles`
   * is legible, it is what the home page's tiles have always linked to,
   * and `ct3` would tie a shareable URL to a primary key.
   */
  const bySlug = useMemo(
    () => ({
      categoryId: new Map(categories.map((c) => [c.slug, c.id])),
      categorySlug: new Map(categories.map((c) => [c.id, c.slug])),
      occasionId: new Map(occasions.map((o) => [o.slug, o.id])),
      occasionSlug: new Map(occasions.map((o) => [o.id, o.slug])),
    }),
    [categories, occasions],
  );

  const decode = useCallback(
    (query: string) => {
      const params = parseBrowseParams(query);
      // An unknown slug resolves to nothing rather than to an empty grid —
      // a link to a category that has since been renamed should show the
      // catalogue, not "No products match your filters."
      const ids = (slugs: string[], lookup: Map<string, string>) =>
        new Set(slugs.map((slug) => lookup.get(slug)).filter((id): id is string => Boolean(id)));
      return {
        categories: ids(params.categories, bySlug.categoryId),
        occasions: ids(params.occasions, bySlug.occasionId),
        dietary: new Set(params.dietary),
        // Clamped, because the bounds come from the product set and a URL
        // written when the catalogue was wider would otherwise hide rows
        // the sidebar says are there.
        price: (params.price
          ? [
              Math.max(priceBounds[0], params.price[0]),
              Math.min(priceBounds[1], params.price[1]),
            ]
          : priceBounds) as [number, number],
        view: params.view,
        sort: params.sort,
        page: params.page,
      };
    },
    [bySlug, priceBounds],
  );

  const initial = useMemo(() => decode(initialQuery), [decode, initialQuery]);

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(initial.categories);
  const [selectedDietary, setSelectedDietary] = useState<Set<DietaryTag>>(initial.dietary);
  const [selectedOccasions, setSelectedOccasions] = useState<Set<string>>(initial.occasions);
  const [priceRange, setPriceRange] = useState<[number, number]>(initial.price);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [view, setView] = useState<BrowseView>(initial.view);
  const [page, setPage] = useState(initial.page);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const adopt = useCallback(
    (query: string) => {
      const next = decode(query);
      setSelectedCategories(next.categories);
      setSelectedDietary(next.dietary);
      setSelectedOccasions(next.occasions);
      setPriceRange(next.price);
      setSort(next.sort);
      setView(next.view);
      setPage(next.page);
    },
    [decode],
  );

  /**
   * Back and forward. The browser restores the URL but not React state, so
   * without this, going back to a filtered `/shop` shows the filtered URL
   * over the unfiltered grid — the bug this replaced, wearing a URL.
   *
   * `replaceState` does not fire `popstate`, so the writer below cannot
   * loop through here.
   */
  useEffect(() => {
    const onPopState = () => adopt(window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [adopt]);

  const router = useRouter();
  const lastWritten = useRef<string | null>(null);

  /**
   * `router.replace`, debounced — and the two obvious alternatives are
   * both wrong here, which is worth writing down because both look right.
   *
   * - **`router.push`** makes every checkbox its own history entry, so
   *   leaving a page you filtered four times takes five Backs.
   * - **`window.history.replaceState`** looks ideal — it rewrites the
   *   entry in place with no server round trip, and Next documents it for
   *   search params. It does not survive Back. Next's App Router keeps
   *   `renderedSearch` in its own history state, and on restore it
   *   normalises the URL back to that value: measured on 2026-08-08, the
   *   `popstate` handler below fired with `location.search` already reset
   *   to `""`, so the filters were gone before anything could read them.
   *   `router.replace` is what updates the router's own record.
   *
   * Debounced because `replace` refetches this route's RSC payload:
   * without it a drag of the price slider is one request per pixel.
   */
  useEffect(() => {
    const query = browseParamsToQuery({
      categories: [...selectedCategories]
        .map((id) => bySlug.categorySlug.get(id))
        .filter((slug): slug is string => Boolean(slug)),
      occasions: [...selectedOccasions]
        .map((id) => bySlug.occasionSlug.get(id))
        .filter((slug): slug is string => Boolean(slug)),
      view,
      dietary: [...selectedDietary],
      price:
        priceRange[0] === priceBounds[0] && priceRange[1] === priceBounds[1] ? null : priceRange,
      sort,
      page,
    } satisfies BrowseParams);

    // Anything we do not own is preserved — a `utm_source` on a shared
    // link would otherwise be deleted by the first click on a filter.
    const merged = new URLSearchParams(window.location.search);
    for (const key of ["view", "category", "occasion", "diet", "minPrice", "maxPrice", "sort", "page"]) {
      merged.delete(key);
    }
    for (const [key, value] of new URLSearchParams(query)) merged.append(key, value);

    const search = merged.toString();
    // The first run is the URL we were rendered from — rewriting it would
    // be a round trip to arrive where we already are, and on a Back
    // restore it would overwrite the query Next just gave back to us.
    if (lastWritten.current === null) {
      lastWritten.current = new URLSearchParams(window.location.search).toString();
      if (lastWritten.current === search) return;
    }
    if (lastWritten.current === search) return;
    lastWritten.current = search;

    const timer = window.setTimeout(() => {
      // `scroll: false` — a filter change is not a navigation, and being
      // thrown to the top of the page on every checkbox loses your place
      // in the sidebar.
      router.replace(`${window.location.pathname}${search ? `?${search}` : ""}`, {
        scroll: false,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    bySlug,
    router,
    page,
    priceBounds,
    priceRange,
    selectedCategories,
    selectedDietary,
    selectedOccasions,
    sort,
    view,
  ]);

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

  /**
   * "Nearest" is offered only when the listings actually carry a distance
   * — i.e. when the buyer's coordinates were sent. Offering it to somebody
   * who declined the location prompt is a control that silently does
   * nothing, which is worse than one that is not there. It stays visible
   * if it is the current sort, so a shared `?sort=nearest` URL never
   * renders a select whose value is not among its options.
   */
  const hasDistance = useMemo(
    () => products.some((product) => product.distanceKm !== undefined),
    [products],
  );

  const pageSize = isKitchens ? KITCHEN_PAGE_SIZE : PAGE_SIZE;
  const resultCount = isKitchens ? kitchens.length : sorted.length;
  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
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

  // One tap out of a filtered dead end (M37). State-setter resets — the
  // debounced `router.replace` sync writes the cleared URL, same as any
  // other filter change.
  function clearFilters() {
    setSelectedCategories(new Set());
    setSelectedDietary(new Set());
    setSelectedOccasions(new Set());
    setPriceRange(priceBounds);
    setPage(1);
  }

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
          {categories.map((category) => {
            const count = categoryCounts.get(category.id) ?? 0;
            const checked = selectedCategories.has(category.id);
            return (
              <label key={category.id} className={clsx(styles.checkboxRow, count === 0 && !checked && styles.checkboxRowEmpty)}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onChange={() => toggle(selectedCategories, setSelectedCategories, category.id)}
                />
                {category.name}
                <span className={styles.count}>{count}</span>
              </label>
            );
          })}
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterTitle}>Dietary</div>
          {DIETARY_OPTIONS.map((tag) => {
            const count = dietaryCounts.get(tag) ?? 0;
            const checked = selectedDietary.has(tag);
            return (
              <label key={tag} className={clsx(styles.checkboxRow, count === 0 && !checked && styles.checkboxRowEmpty)}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onChange={() => toggle(selectedDietary, setSelectedDietary, tag)}
                />
                {DIETARY_LABELS[tag]}
                <span className={styles.count}>{count}</span>
              </label>
            );
          })}
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterTitle}>Occasion</div>
          {occasions.map((occasion) => {
            const count = occasionCounts.get(occasion.id) ?? 0;
            const checked = selectedOccasions.has(occasion.id);
            return (
              <label key={occasion.id} className={clsx(styles.checkboxRow, count === 0 && !checked && styles.checkboxRowEmpty)}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onChange={() => toggle(selectedOccasions, setSelectedOccasions, occasion.id)}
                />
                {occasion.name}
                <span className={styles.count}>{count}</span>
              </label>
            );
          })}
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
          <div className={styles.activeChips}>
            {activeChips.map((chip) => (
              <Chip key={chip.key} label={chip.label} selected onRemove={chip.onRemove} />
            ))}
          </div>
          <label className={styles.sortRow}>
            Sort
            <select
              // The wrapping label already names this, but a name computed
              // from a label that contains the control folds the selected
              // option into it — announced as "Sort, Most loved" at best
              // and the whole option list at worst. Stating it once keeps
              // the announced name the same as the visible one.
              aria-label="Sort"
              className={styles.sortSelect}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortKey);
                setPage(1);
              }}
            >
              <option value="most-loved">Most loved</option>
              {(hasDistance || sort === "nearest") && <option value="nearest">Nearest first</option>}
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
        </div>

        {resultCount === 0 ? (
          /* The three-part empty state (M37): what happened, which
             filters caused it, and the way out. A bare "no products"
             over an active filter set reads as an empty catalogue. */
          <div className={styles.empty}>
            <p>
              {activeCount > 0
                ? `Nothing matches ${activeChips.map((chip) => chip.label).join(" + ")}${
                    priceRange[0] !== priceBounds[0] || priceRange[1] !== priceBounds[1]
                      ? " in this price range"
                      : ""
                  }.`
                : "Nothing matches this view."}
            </p>
            <p>Every filter narrows the same catalogue — loosen one and the kitchens come back.</p>
            {(activeCount > 0 ||
              priceRange[0] !== priceBounds[0] ||
              priceRange[1] !== priceBounds[1]) && (
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
