import type { Metadata } from "next";
import clsx from "clsx";
import { getBuyerCoords } from "@/lib/location/server";
import { getCategories, getFoodProducts, getOccasions, getVendors } from "@/lib/api";
import { buildKitchens } from "@/lib/kitchens";
import { LocationBar } from "@/components/location/LocationBar";
import { ShopClient } from "./ShopClient";
import { HeroBanner } from "@/components/browse/HeroBanner";
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

  // The header counts kitchens first, because that is what the page opens
  // on (M51). Derived with the same pure function the grid uses, so the
  // number in the heading and the number on the toggle cannot disagree —
  // and computed on the server rather than in an effect, so it is in the
  // HTML rather than appearing a moment later.
  const kitchens = buildKitchens(products, vendors, categories);
  const kitchenCount = kitchens.length;

  return (
    <>
      {/* The hero band (M59b, photo M59c, cut to the bone 2026-09-05): the
          page opens as a place, not a settings screen — the photograph,
          the display title with its italic accent, one line of counts, and
          the area control. Everything else that used to be here left on the
          owner's instruction ("reduce the number of elements"): the
          featured-kitchens strip duplicated the kitchen grid it sat on top
          of, the stat pills were two boxes for one sentence, and the
          sibling-surface rail repeated the nav and the footer. What stays
          is what the grid cannot say about itself. Warmth is accent-only:
          the tint is the pine selected-fill token fading to the canvas. */}
      <div className={styles.hero}>
        <HeroBanner src="/images/site/hero-food.jpg" tint="pine" />
        <div className={clsx("container", "container-wide", styles.heroInner)}>
          <div className={styles.heroCopy}>
            <span className={styles.breadcrumb}>
              Home / <span className={styles.breadcrumbCurrent}>Homemade Food</span>
            </span>
            {/*
              Title and tagline on one baseline (2026-09-05, owner: "this
              takes up a lot of space"). The band was five stacked rows
              before the filters — breadcrumb, title, tagline, stat pills,
              location, cross-links, then the featured strip — about 520px
              of chrome above the first kitchen. It is the same information,
              on two rows instead of five.
            */}
            <div className={styles.titleRow}>
              <h1 className={styles.title}>
                Homemade <em className={styles.titleAccent}>Food</em>
              </h1>
              <p className={styles.tagline}>
                Cooked to order in real home kitchens — never off a shelf.
              </p>
            </div>
            {/*
              One line of counts and the one control. The counts are receipt
              type — mono, honestly counted, the DESIGN.md provenance voice —
              rather than two bordered pills, which were two boxes for one
              sentence. The location bar stays a control because it carries
              the only route back to the prompt (see `LocationBar`).
            */}
            <div className={styles.metaRow}>
              <p className={styles.stats}>
                <strong>{kitchenCount}</strong> home {kitchenCount === 1 ? "kitchen" : "kitchens"}
                <span className={styles.statsDot} aria-hidden="true">
                  ·
                </span>
                <strong>{products.length}</strong> small-batch{" "}
                {products.length === 1 ? "dish" : "dishes"}
              </p>
              <LocationBar />
            </div>
          </div>
        </div>
      </div>
      <ShopClient
        products={products}
        categories={categories}
        occasions={occasions}
        vendors={vendors}
        vendorNameById={vendorNameById}
        initialQuery={toQuery(params)}
      />
    </>
  );
}
