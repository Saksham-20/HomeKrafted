"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Chip } from "@/components/ui/Chip";
import { PriceRange } from "@/components/ui/PriceRange";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import {
  browseParamsToQuery,
  parseBrowseParams,
  type BrowseParams,
  type BrowseSortKey,
} from "@/lib/browse-params";
import type { Category, DietaryTag, Occasion, Product } from "@/lib/types";
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
      dietary: [...selectedDietary],
      price:
        priceRange[0] === priceBounds[0] && priceRange[1] === priceBounds[1] ? null : priceRange,
      sort,
      page,
    } satisfies BrowseParams);

    // Anything we do not own is preserved — a `utm_source` on a shared
    // link would otherwise be deleted by the first click on a filter.
    const merged = new URLSearchParams(window.location.search);
    for (const key of ["category", "occasion", "diet", "minPrice", "maxPrice", "sort", "page"]) {
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
