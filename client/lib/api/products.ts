import type { Product } from "@/lib/types";
import {
  getProductById as getProductByIdData,
  getProductBySlug,
  products,
} from "@/lib/data/products";
import { http, isMockMode } from "./http";

/**
 * Products/catalog (M8.4a — real). `GET /products`/`GET /products/:slug`
 * (`docs/API.md` "Commerce (M8.1)") are `@Public()` — no auth header
 * needed, safe to call from a Server Component during SSR. The catalog is
 * small (8 seed products) so `getProducts()` fetches the whole list in one
 * page (`pageSize=100`, comfortably above `total`) rather than wiring real
 * pagination through every call site — `ShopClient`'s own filter/sort/
 * pagination stays entirely client-side over that full list, unchanged.
 * `getProductsByCategory`/`getProductsByOccasion`/`getProductsByVendor`
 * take an *id* (not a slug) at their existing call sites, so — rather than
 * resolving id→slug through an extra round trip to use the server's
 * `?category=slug` query filter — they simply filter the same full list
 * client-side, identical to the pre-M8.4a mock's own filtering logic.
 */

/**
 * Allowlist, not `!== "hidden"` (M22). Mock data mostly omits the field,
 * so the `?? "active"` fallback is what keeps every seeded fixture
 * browsable — without it, mock mode would show an empty catalogue.
 */
function isBrowsable(product: Product): boolean {
  return (product.moderationStatus ?? "active") === "active";
}

interface ProductsPage {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * The browsable catalogue.
 *
 * `near` is the buyer's coordinates. Supplied, the server returns only
 * items from kitchens whose delivery radius actually reaches them, each
 * carrying a `distanceKm`. Omitted — which is the case for anyone who
 * declined the location prompt and hasn't picked an area — the full
 * catalogue comes back, because browsing is never gated on a permission
 * the visitor refused.
 */
export async function getProducts(near?: { lat: number; lng: number }): Promise<Product[]> {
  if (isMockMode()) return products.filter(isBrowsable);
  const first = await http.get<ProductsPage>("/products", {
    auth: false,
    query: { pageSize: 100, ...(near ? { lat: near.lat, lng: near.lng } : {}) },
  });
  let all = [...(first.items || [])];
  if (first.total > all.length) {
    const totalPages = Math.ceil(first.total / 100);
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        http.get<ProductsPage>("/products", {
          auth: false,
          query: { pageSize: 100, page: i + 2, ...(near ? { lat: near.lat, lng: near.lng } : {}) },
        }),
      ),
    );
    for (const page of remaining) {
      if (page.items) all = all.concat(page.items);
    }
  }
  return all;
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  if (isMockMode()) return getProductBySlug(slug);
  try {
    return await http.get<Product>(`/products/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

/** Lookup by id — the cart store only persists `productId`, so it needs this to resolve a line. No dedicated by-id endpoint; resolves from the full catalog fetch. */
export async function getProductById(id: string): Promise<Product | undefined> {
  if (isMockMode()) return getProductByIdData(id);
  const all = await getProducts();
  return all.find((p) => p.id === id);
}

/**
 * Ready-made gift hampers (M18) — the catalogue filtered to listings a
 * HomeKrafter marked as a hamper.
 *
 * Filtered server-side (`?isHamper=true`) rather than by fetching
 * everything and filtering here, because this is a whole page's worth of
 * content and the alternative downloads the entire catalogue to throw
 * most of it away. `getProductsByCategory` and friends above do filter
 * client-side; they are rails on a page that has already paid for the
 * fetch.
 */
/**
 * Handcrafted gifts (M20) — `kind: craft`.
 *
 * `near` is still passed even though most craft listings ship nationally:
 * the server decides per listing whether the radius applies
 * (`shippingScope`), and a locally-delivered craft should still be filtered
 * like anything else. Sending coords and letting the server judge is the
 * only version that stays correct when a maker changes their mind.
 */
export async function getCraftProducts(near?: { lat: number; lng: number }): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.kind === "craft" && isBrowsable(p));
  const page = await http.get<ProductsPage>("/products", {
    auth: false,
    query: {
      pageSize: 100,
      kind: "craft",
      ...(near ? { lat: near.lat, lng: near.lng } : {}),
    },
  });
  return page.items;
}

/**
 * Homemade food (M20) — `kind: food`, the other half of `getCraftProducts`.
 *
 * `/shop` used the unfiltered `getProducts` instead, so a page headed
 * "Homemade Foods", reached from a nav item reading "Homemade Food", and
 * described in its own metadata as "small-batch pickles, sweets, bakes and
 * snacks" listed candles, jewellery and art prints alongside them —
 * 8 crafts among 16 products, with craft categories offered as filters in
 * the sidebar. The whole point of `Product.kind` in M20 was that these are
 * two verticals; `/gifts` was filtered and `/shop` was left as the
 * everything-page it had been before crafts existed.
 */
/**
 * `/shop` derives its kitchen list from these rows, so the page size
 * decides which KITCHENS exist, not just which dishes.
 *
 * `buildKitchens` groups the products the page fetched (M51), which is
 * what keeps the delivery-radius filter in one place. The cost is that a
 * kitchen with no product inside the fetched page does not exist on the
 * page at all — and at `pageSize: 100` against 113 live food listings,
 * two real kitchens (My Indian Jar, 8 listings; The Sacred Pour, 3) were
 * already invisible to a buyer with no location set. The ordering is
 * `rating desc, reviewCount desc, id asc`, and a catalogue with almost no
 * reviews collapses that to creation order, so the kitchens that
 * disappear are the newest ones — the opposite of what anybody wants.
 *
 * 500 is the server's own ceiling: `@Max(500)` on the query DTO, matching
 * the `take: 500` candidate cap the located path already uses. So this
 * asks for exactly as much as the API will ever consider, and the
 * client's number stops being an arbitrary second limit below it.
 *
 * Past 500 live food listings this needs the vendor set as a real facet
 * computed over the whole matching query, not a wider page — filtering
 * stays a client-side `useMemo` (M49) and that much further is a payload
 * problem rather than a correctness one.
 */
const BROWSE_PAGE_SIZE = 500;

export async function getFoodProducts(near?: { lat: number; lng: number }): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.kind !== "craft" && isBrowsable(p));
  const page = await http.get<ProductsPage>("/products", {
    auth: false,
    query: {
      pageSize: BROWSE_PAGE_SIZE,
      kind: "food",
      // Show the whole city and say which half delivers, rather than
      // quietly returning a short list. Only has an effect alongside
      // coordinates; without them nothing was being filtered anyway.
      ...(near ? { lat: near.lat, lng: near.lng, includeOutOfRange: true } : {}),
    },
  });
  return page.items;
}

export async function getHamperProducts(near?: { lat: number; lng: number }): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.isHamper && isBrowsable(p));
  const page = await http.get<ProductsPage>("/products", {
    auth: false,
    query: {
      pageSize: 100,
      isHamper: true,
      ...(near ? { lat: near.lat, lng: near.lng } : {}),
    },
  });
  return page.items;
}

/** "This week's small batches" home rail — every `featured` product. */
export async function getFeatured(): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.featured && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.featured);
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.categoryId === categoryId && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.categoryId === categoryId);
}

export async function getProductsByOccasion(occasionId: string): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.occasionIds.includes(occasionId) && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.occasionIds.includes(occasionId));
}

export async function getProductsByVendor(vendorId: string): Promise<Product[]> {
  if (isMockMode()) return products.filter((p) => p.vendorId === vendorId && isBrowsable(p));
  const all = await getProducts();
  return all.filter((p) => p.vendorId === vendorId);
}
