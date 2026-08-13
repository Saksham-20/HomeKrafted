import type { Metadata } from "next";
import clsx from "clsx";
import { getBuyerCoords } from "@/lib/location/server";
import { getCategories, getFoodProducts, getOccasions, getVendors } from "@/lib/api";
import { LocationBar } from "@/components/location/LocationBar";
import { ShopClient } from "./ShopClient";
import { pageMetadata } from "@/lib/seo";
import styles from "./Shop.module.css";

export interface ShopPageProps {
  /**
   * Every browse param lives here now — category, occasion, diet, price,
   * sort and page — and `ShopClient` decodes the lot. Before the
   * 2026-08-08 sweep only the first two existed, they seeded the sidebar
   * once and were never rewritten, so Back landed on an unfiltered page 1
   * and a filtered view could not be sent to anybody. See
   * `lib/browse-params.ts`.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The page's query string, flattened the way `URLSearchParams` reads it. */
function toQuery(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, item);
    else if (value !== undefined) search.set(key, value);
  }
  return search.toString();
}

/**
 * Shop listing (Gifting Marketplace browse) — server page fetches the full
 * mock catalog via `lib/api` and hands it to `<ShopClient>`, which owns all
 * interactive filter/sort/pagination state. `?category=` / `?occasion=`
 * (set by Home's category tiles + occasion tiles) seed the sidebar's
 * initial selection.
 */
export const metadata: Metadata = pageMetadata({
  title: "Homemade Food",
  description:
    "Small-batch pickles, sweets, bakes and snacks from home kitchens across Chandigarh, Mohali, Panchkula and Zirakpur. Filter by category, occasion, diet and distance.",
  path: "/shop",
});

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  // Read the buyer's area from the `hk_loc` cookie so the server render
  // filters too — `LocationContext` lives in localStorage, which this
  // Server Component can't see. Undefined (no area picked, prompt
  // declined) means the full catalogue, never an empty page.
  const near = await getBuyerCoords();
  const [products, allCategories, occasions, vendors] = await Promise.all([
    // `getFoodProducts`, not `getProducts`. This page is one of two
    // verticals, and the unfiltered call made it the everything-page it
    // had been before crafts existed — a screen headed "Homemade Foods"
    // listing candles and jewellery. See `getFoodProducts`'s doc comment.
    getFoodProducts(near),
    getCategories(),
    getOccasions(),
    getVendors(),
  ]);

  // The sidebar's facets have to be scoped the same way the listing is, or
  // the filters describe a catalogue this page does not show: "Candles &
  // Home 4" was a checkbox here, and ticking it now empties the grid.
  // `group` is absent on pre-M20 rows and reads as food (see `Category`).
  const categories = allCategories.filter((category) => category.group !== "craft");

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  return (
    <>
      <div className={clsx("container", styles.breadcrumbWrap)}>
        <span className={styles.breadcrumb}>
          Home / <span className={styles.breadcrumbCurrent}>Homemade Food</span>
        </span>
        <h1 className={styles.title}>Homemade Food</h1>
        <p className={styles.subtitle}>
          {products.length} small-batch products from home kitchens across India
        </p>
        {/* Says whether this count is the whole catalogue or a filtered
            one, and gives the only route back to the prompt — see
            `LocationBar`. */}
        <LocationBar />
      </div>
      <ShopClient
        products={products}
        categories={categories}
        occasions={occasions}
        vendorNameById={vendorNameById}
        initialQuery={toQuery(params)}
      />
    </>
  );
}
