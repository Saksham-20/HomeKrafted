import clsx from "clsx";
import { getCategories, getCraftProducts, getOccasions, getVendors } from "@/lib/api";
import { getBuyerCoords } from "@/lib/location/server";
import { GiftsClient } from "./GiftsClient";
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

  // Counted from the listings that reached this buyer, like /shop's kitchen
  // count — a maker appears exactly when something of theirs is live here.
  const makerCount = new Set(gifts.map((gift) => gift.vendorId)).size;

  return (
    <>
      {/* The hero band (M59b; photo M59c; featured row removed 2026-09-05
          with /shop's — it duplicated the grid under it) — same shape as
          /shop's, on the gold tint: two verticals, two grounds, one
          composition. The banner photo sits behind the copy under a wash
          that stays solid tint over the text column. */}
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
                Décor, candles, art and jewellery by independent makers.
              </p>
            </div>
            {/*
              One line of counts, the same shape as /shop's, ending on the one
              fact the grid cannot say about itself: food is cooked nearby and
              driven to you, craft goes in the post. It used to be its own
              two-line paragraph under a two-line description (owner,
              2026-09-05: "reduce the number of elements").
            */}
            <p className={styles.stats}>
              <strong>{gifts.length}</strong> handmade {gifts.length === 1 ? "gift" : "gifts"}
              <span className={styles.statsDot} aria-hidden="true">
                ·
              </span>
              <strong>{makerCount}</strong> {makerCount === 1 ? "maker" : "makers"}
              <span className={styles.statsDot} aria-hidden="true">
                ·
              </span>
              most ship <b className={styles.statsEm}>anywhere in India</b>
            </p>
          </div>
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
