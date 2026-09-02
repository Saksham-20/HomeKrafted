import clsx from "clsx";
import { getCategories, getCraftProducts, getOccasions, getVendors } from "@/lib/api";
import { getBuyerCoords } from "@/lib/location/server";
import { GiftsClient } from "./GiftsClient";
import { pageMetadata } from "@/lib/seo";
import styles from "./Gifts.module.css";

/**
 * Handcrafted Gifts (M20) — the platform's second vertical. Browse
 * machinery (filters, sort, URL state, pagination) arrived in M56 via
 * `GiftsClient`, composed from the same `components/browse/` pieces as
 * `/shop`.
 *
 * Same reasoning as `/hamper` for `force-dynamic`: this reads the `hk_loc`
 * cookie, and `getBuyerCoords` swallows the error `cookies()` throws during
 * a prerender, which hides the per-visitor signal from Next and leaves the
 * route eligible for static export. That turned into a build-time fetch
 * against an API that wasn't up yet.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Handcrafted gifts, made by hand",
  description:
    "Handmade décor, candles, art, jewellery and personalised gifts from independent HomeKrafters — most posted anywhere in India.",
  path: "/gifts",
});

export interface GiftsPageProps {
  /** Every browse param — see `lib/browse-params.ts`. */
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

export default async function GiftsPage({ searchParams }: GiftsPageProps) {
  const params = await searchParams;
  const near = await getBuyerCoords();
  const [gifts, allCategories, occasions, vendors] = await Promise.all([
    getCraftProducts(near),
    getCategories(),
    getOccasions(),
    getVendors(),
  ]);

  // The sidebar's facets have to be scoped the same way the listing is
  // (the /shop rule in reverse): a food category here would be a checkbox
  // that empties the grid.
  const categories = allCategories.filter((category) => category.group === "craft");

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  return (
    <>
      {/* The hero band (M59b) — same shape as /shop's, on the gold tint:
          two verticals, two grounds, one composition. */}
      <div className={styles.hero}>
        <div className={clsx("container", styles.heroInner)}>
          <span className={styles.breadcrumb}>
            Home / <span className={styles.breadcrumbCurrent}>Handcrafted gifts</span>
          </span>
          <h1 className={styles.title}>
            Handcrafted <em className={styles.titleAccent}>Gifts</em>
          </h1>
          <p className={styles.description}>
            Handmade décor, candles, art, jewellery and personalised pieces, made by independent
            HomeKrafters.
          </p>
          {/*
            The genuinely useful difference between the two verticals, said
            plainly rather than discovered at checkout: food is cooked nearby
            and driven to you, craft goes in the post.
          */}
          <p className={styles.shipping}>
            Most gifts here ship <strong>anywhere in India</strong> — unlike homemade food, which
            only travels as far as the kitchen delivers.
          </p>
        </div>
      </div>

      <GiftsClient
        products={gifts}
        categories={categories}
        occasions={occasions}
        vendorNameById={vendorNameById}
        initialQuery={toQuery(params)}
      />
    </>
  );
}
