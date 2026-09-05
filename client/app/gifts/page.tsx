import clsx from "clsx";
import { getCategories, getCraftProducts, getOccasions, getVendors } from "@/lib/api";
import { getBuyerCoords } from "@/lib/location/server";
import { GiftsClient } from "./GiftsClient";
import { FeaturedPicks } from "@/components/browse/FeaturedPicks";
import { HeroBanner } from "@/components/browse/HeroBanner";
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

  // Featured picks (M59c): the admin's merchandising flag first, then the
  // best-rated of the rest — and only a reviewed rating counts (the M53
  // "most loved" rule: an unreviewed listing carries `rating: 0`). The
  // unreviewed tail fills leftover slots in catalogue order: the strip
  // prints no rating, so featuring an unreviewed listing claims nothing —
  // it is merchandising, same as the flag.
  // One listing per maker while it can be — four picks from one storefront
  // reads as an advert for that shop, not a picture of the catalogue.
  const picksRanked = [
    ...gifts.filter((gift) => gift.featured),
    ...gifts
      .filter((gift) => !gift.featured && gift.reviewCount > 0)
      .sort((a, b) => b.rating - a.rating),
    ...gifts.filter((gift) => !gift.featured && gift.reviewCount === 0),
  ];
  // A pool of up to 12 for the rotating window (4 visible at a time) —
  // vendor-diverse first so any adjacent four aren't one storefront.
  const featuredPicks: typeof picksRanked = [];
  const featuredVendors = new Set<string>();
  for (const pick of picksRanked) {
    if (featuredPicks.length === 12) break;
    if (featuredVendors.has(pick.vendorId)) continue;
    featuredVendors.add(pick.vendorId);
    featuredPicks.push(pick);
  }
  for (const pick of picksRanked) {
    if (featuredPicks.length === 12) break;
    if (!featuredPicks.includes(pick)) featuredPicks.push(pick);
  }

  return (
    <>
      {/* The hero band (M59b; long photo banner + rotating featured row
          M59c) — same shape as /shop's, on the gold tint: two verticals,
          two grounds, one composition. The banner photo sits behind the
          copy under a wash that stays solid tint over the text column. */}
      <div className={styles.hero}>
        <HeroBanner src="/images/site/split-gifts.jpg" tint="gold" />
        <div className={clsx("container", "container-wide", styles.heroInner)}>
          <div className={styles.heroCopy}>
            <span className={styles.breadcrumb}>
              Home / <span className={styles.breadcrumbCurrent}>Handcrafted gifts</span>
            </span>
            {/* Title and blurb on one baseline — the /shop compaction
                (2026-09-05), applied here so the two verticals keep the
                same composition. */}
            <div className={styles.titleRow}>
              <h1 className={styles.title}>
                Handcrafted <em className={styles.titleAccent}>Gifts</em>
              </h1>
              <p className={styles.description}>
                Handmade décor, candles, art, jewellery and personalised pieces, made by
                independent HomeKrafters.
              </p>
            </div>
            {/*
              The genuinely useful difference between the two verticals, said
              plainly rather than discovered at checkout: food is cooked nearby
              and driven to you, craft goes in the post.
            */}
            <p className={styles.shipping}>
              Most gifts here ship <strong>anywhere in India</strong> — unlike homemade food,
              which only travels as far as the kitchen delivers.
            </p>
          </div>
          <FeaturedPicks products={featuredPicks} vendorNameById={vendorNameById} />
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
