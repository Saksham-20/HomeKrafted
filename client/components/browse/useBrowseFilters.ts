"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  browseParamsToQuery,
  parseBrowseParams,
  type BrowseParams,
  type BrowseSortKey,
  type BrowseView,
  type ShippingScopeFilter,
} from "@/lib/browse-params";
import type { Category, DietaryTag, Occasion, ProductTag } from "@/lib/types";

export interface UseBrowseFiltersArgs {
  categories: Category[];
  occasions: Occasion[];
  /** [min, max] over the loaded product set — the clamp for URL prices. */
  priceBounds: [number, number];
  /**
   * The page's own query string, as the Server Component saw it. Passed
   * rather than read from `useSearchParams()` so the server's first
   * render and the client's hydration decode the same URL.
   */
  initialQuery: string;
}

/**
 * The browse state of a listing page, held in React and mirrored to the
 * URL (M56 — extracted verbatim from `ShopClient` so `/gifts` gets the
 * same machinery: the `lib/browse-params.ts` codec, the popstate
 * adopter, and the debounced `router.replace` writer with its
 * documented reasons for not being `push` or `history.replaceState`).
 */
export function useBrowseFilters({
  categories,
  occasions,
  priceBounds,
  initialQuery,
}: UseBrowseFiltersArgs) {
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
        tags: new Set(params.tags),
        sale: params.sale,
        shipping: new Set(params.shipping),
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
  const [selectedTags, setSelectedTags] = useState<Set<ProductTag>>(initial.tags);
  const [saleOnly, setSaleOnly] = useState<boolean>(initial.sale);
  const [selectedShipping, setSelectedShipping] = useState<Set<ShippingScopeFilter>>(
    initial.shipping,
  );
  const [priceRange, setPriceRange] = useState<[number, number]>(initial.price);
  const [sort, setSortState] = useState<BrowseSortKey>(initial.sort);
  const [view, setView] = useState<BrowseView>(initial.view);
  const [page, setPage] = useState(initial.page);

  const adopt = useCallback(
    (query: string) => {
      const next = decode(query);
      setSelectedCategories(next.categories);
      setSelectedDietary(next.dietary);
      setSelectedOccasions(next.occasions);
      setSelectedTags(next.tags);
      setSaleOnly(next.sale);
      setSelectedShipping(next.shipping);
      setPriceRange(next.price);
      setSortState(next.sort);
      setView(next.view);
      setPage(next.page);
    },
    [decode],
  );

  /**
   * Back and forward. The browser restores the URL but not React state, so
   * without this, going back to a filtered listing shows the filtered URL
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
   *   `popstate` handler above fired with `location.search` already reset
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
      tags: [...selectedTags],
      sale: saleOnly,
      shipping: [...selectedShipping],
      price:
        priceRange[0] === priceBounds[0] && priceRange[1] === priceBounds[1] ? null : priceRange,
      sort,
      page,
    } satisfies BrowseParams);

    // Anything we do not own is preserved — a `utm_source` on a shared
    // link would otherwise be deleted by the first click on a filter.
    const merged = new URLSearchParams(window.location.search);
    for (const key of [
      "view",
      "category",
      "occasion",
      "diet",
      "tag",
      "sale",
      "ship",
      "minPrice",
      "maxPrice",
      "sort",
      "page",
    ]) {
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
    saleOnly,
    selectedCategories,
    selectedDietary,
    selectedOccasions,
    selectedShipping,
    selectedTags,
    sort,
    view,
  ]);

  /** Toggle a set member; every filter change resets to page 1. */
  function toggle<T>(set: Set<T>, setSet: (next: Set<T>) => void, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
    setPage(1);
  }

  function setSort(next: BrowseSortKey) {
    setSortState(next);
    setPage(1);
  }

  const priceNarrowed = priceRange[0] !== priceBounds[0] || priceRange[1] !== priceBounds[1];

  // One tap out of a filtered dead end (M37). State-setter resets — the
  // debounced `router.replace` sync writes the cleared URL, same as any
  // other filter change.
  function clearFilters() {
    setSelectedCategories(new Set());
    setSelectedDietary(new Set());
    setSelectedOccasions(new Set());
    setSelectedTags(new Set());
    setSaleOnly(false);
    setSelectedShipping(new Set());
    setPriceRange(priceBounds);
    setPage(1);
  }

  return {
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
  };
}
