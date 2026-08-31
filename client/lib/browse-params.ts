import type { DietaryTag, ProductTag } from "@/lib/types";

/**
 * The browse state of a listing page, as it lives in the URL.
 *
 * `/shop` kept every filter, the sort and the page number in component
 * state and never touched the address bar. Three things followed, and all
 * three were confirmed in a browser during the 2026-08-08 sweep:
 *
 * - **Back loses your place.** Sort by price, go to page 2, open a
 *   product, press Back: unsorted page 1. On a catalogue you narrow before
 *   you buy, that is the browse loop broken at the point it matters.
 * - **A filtered view cannot be sent to anybody.** The URL says `/shop`
 *   whatever is on screen.
 * - **`?category=` went stale.** It seeded the initial selection and was
 *   never rewritten, so un-ticking that category left the URL claiming it
 *   and a refresh silently put it back.
 *
 * Kept as pure functions over `URLSearchParams` so both halves — the
 * Server Component's first render and the client's rewrites — read the
 * same rules, and so the parsing is testable without a browser. **Every
 * value here arrives from a URL somebody else may have written**, so
 * parsing never trusts: an unknown sort, a page of `-3`, `NaN` prices and
 * a diet tag that does not exist all resolve to the default rather than
 * throwing or filtering the grid to nothing.
 */

export type BrowseSortKey = "most-loved" | "price-asc" | "price-desc" | "nearest";

export const BROWSE_SORT_KEYS: BrowseSortKey[] = [
  "most-loved",
  "price-asc",
  "price-desc",
  // M51. Reads `distanceKm`, which is present on a listing only when the
  // buyer's coordinates were sent — so it is offered whatever the visitor
  // did with the location prompt, and simply orders every unknown
  // distance last rather than hiding a control that would then appear
  // from nowhere the moment an area was picked.
  "nearest",
];

export const DEFAULT_BROWSE_SORT: BrowseSortKey = "most-loved";

const DIETARY_TAGS: DietaryTag[] = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "sugar-free",
  "contains-nuts",
];

/**
 * The merchandising tags a listing can carry (M56). Validated the same
 * way dietary tags are: an unknown value in the URL is dropped, never
 * passed through to filter the grid to nothing.
 */
export const PRODUCT_TAG_VALUES: ProductTag[] = ["Bestseller", "New", "Festive", "Curated"];

/**
 * How a listing travels (M56): `local` is cooked-fresh food delivered
 * nearby (a thali, rajma chawal, warm brownies), `national` is what
 * survives a courier — pickles, cookies, dry snacks, and most crafts.
 * The owner's framing: some food *is* a craft in shipping terms.
 */
export type ShippingScopeFilter = "local" | "national";

export const SHIPPING_SCOPE_VALUES: ShippingScopeFilter[] = ["local", "national"];

/**
 * Which half of `/shop` is showing (M51): the kitchens cooking, or every
 * dish flattened into one grid.
 *
 * `kitchens` is the default because ordering food is a decision about who
 * cooks it — see `lib/kitchens.ts`. `dishes` is the older grid, kept
 * because "who has ragi cookies" is a real question and a kitchen list
 * answers it badly.
 */
export type BrowseView = "kitchens" | "dishes";

export const BROWSE_VIEWS: BrowseView[] = ["kitchens", "dishes"];

export const DEFAULT_BROWSE_VIEW: BrowseView = "kitchens";

export interface BrowseParams {
  view: BrowseView;
  /** Category slugs, in the order given. Empty means every category. */
  categories: string[];
  /** Occasion slugs. Empty means every occasion. */
  occasions: string[];
  dietary: DietaryTag[];
  /** Merchandising tags (`?tag=Bestseller,Festive`, M56). Empty means every listing. */
  tags: ProductTag[];
  /** `?sale=1` — only listings with a storefront discount running (M56). */
  sale: boolean;
  /**
   * `?ship=national` / `?ship=local` (M56). Empty means both. Two values
   * selected is the same as none — kept as the caller sees it so the
   * checkboxes round-trip.
   */
  shipping: ShippingScopeFilter[];
  /**
   * `null` when the range was left alone. The bounds depend on the product
   * set, which this module deliberately knows nothing about — the caller
   * clamps.
   */
  price: [number, number] | null;
  sort: BrowseSortKey;
  /** 1-based. Clamping against the real page count is the caller's job. */
  page: number;
}

export const DEFAULT_BROWSE_PARAMS: BrowseParams = {
  view: DEFAULT_BROWSE_VIEW,
  categories: [],
  occasions: [],
  dietary: [],
  tags: [],
  sale: false,
  shipping: [],
  price: null,
  sort: DEFAULT_BROWSE_SORT,
  page: 1,
};

/** Comma-separated, trimmed, de-duplicated, empties dropped. */
function parseList(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

function parsePrice(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  // `Number("")` is 0 and `Number(" 12 ")` is 12, which is why the empty
  // case is handled above rather than relying on this.
  return Number.isFinite(value) ? value : null;
}

export function parseBrowseParams(input: string | URLSearchParams): BrowseParams {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;

  const sortRaw = params.get("sort");
  const sort = BROWSE_SORT_KEYS.includes(sortRaw as BrowseSortKey)
    ? (sortRaw as BrowseSortKey)
    : DEFAULT_BROWSE_SORT;

  const viewRaw = params.get("view");
  const view = BROWSE_VIEWS.includes(viewRaw as BrowseView)
    ? (viewRaw as BrowseView)
    : DEFAULT_BROWSE_VIEW;

  const pageRaw = Number(params.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const min = parsePrice(params.get("minPrice"));
  const max = parsePrice(params.get("maxPrice"));
  // A half-stated range is not a range, and an inverted one would filter
  // the grid to nothing with no way to see why.
  const price = min !== null && max !== null && min <= max ? ([min, max] as [number, number]) : null;

  const dietary = parseList(params.get("diet")).filter((tag): tag is DietaryTag =>
    DIETARY_TAGS.includes(tag as DietaryTag),
  );

  const tags = parseList(params.get("tag")).filter((tag): tag is ProductTag =>
    PRODUCT_TAG_VALUES.includes(tag as ProductTag),
  );

  // Strictly `"1"`. `?sale=yes`, `?sale=true` and `?sale=0` all read as
  // off — one spelling, so a shared URL either means it or does nothing.
  const sale = params.get("sale") === "1";

  const shipping = parseList(params.get("ship")).filter((value): value is ShippingScopeFilter =>
    SHIPPING_SCOPE_VALUES.includes(value as ShippingScopeFilter),
  );

  return {
    view,
    categories: parseList(params.get("category")),
    occasions: parseList(params.get("occasion")),
    dietary,
    tags,
    sale,
    shipping,
    price,
    sort,
    page,
  };
}

/**
 * The query string for a browse state — `""` when nothing is narrowed.
 *
 * Defaults are omitted rather than spelled out, so an untouched `/shop`
 * stays `/shop` and the canonical URL in `app/shop/page.tsx` keeps
 * matching what is in the address bar.
 */
export function browseParamsToQuery(state: BrowseParams): string {
  const params = new URLSearchParams();
  if (state.view !== DEFAULT_BROWSE_VIEW) params.set("view", state.view);
  if (state.categories.length) params.set("category", state.categories.join(","));
  if (state.occasions.length) params.set("occasion", state.occasions.join(","));
  if (state.dietary.length) params.set("diet", state.dietary.join(","));
  if (state.tags.length) params.set("tag", state.tags.join(","));
  if (state.sale) params.set("sale", "1");
  if (state.shipping.length) params.set("ship", state.shipping.join(","));
  if (state.price) {
    params.set("minPrice", String(state.price[0]));
    params.set("maxPrice", String(state.price[1]));
  }
  if (state.sort !== DEFAULT_BROWSE_SORT) params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}
