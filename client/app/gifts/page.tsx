import clsx from "clsx";
import { getCategories, getCraftProducts, getDepartments, getFacets, getOccasions, getVendors } from "@/lib/api";
import { getBuyerCoords } from "@/lib/location/server";
import { GiftsClient } from "./GiftsClient";
import { ComingUp, type ComingUpItem } from "@/components/gifts/ComingUp";
import { pageMetadata } from "@/lib/seo";
import { groupOccasions, SEASONAL_BANNER_DAYS } from "@/lib/occasions";
import styles from "./Gifts.module.css";

/**
 * How far ahead the "Coming up" strip looks (§5.1.4).
 *
 * Wider than `SEASONAL_BANNER_DAYS`, which decides what leads the sort:
 * something six weeks out is worth *seeing* on a gift page — handmade
 * things are made to order and the maker needs the notice — while only
 * something close should reorder the whole grid.
 */
const COMING_UP_DAYS = 45;

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
  // The finder's "for ___" is filtered server-side — see `getCraftProducts`.
  const recipient = typeof params.recipient === "string" ? params.recipient : undefined;
  const [gifts, allCategories, departments, facets, occasions, vendors] = await Promise.all([
    getCraftProducts({ near: near ?? undefined, recipient }),
    getCategories(),
    getDepartments("craft"),
    // Unfiltered on purpose: these are the options the finder *offers*, and
    // narrowing them by the current selection would remove the recipient a
    // buyer is trying to switch to.
    getFacets(),
    getOccasions(),
    getVendors(),
  ]);

  /*
    The recipient options come from the live `recipient` attribute, not a
    hand-kept list — the whole point of G1 is that what a shelf asks is
    data. An empty facet means nobody has answered it yet, and the select
    then offers only "anyone", which is honest: absence is not an answer.
  */
  const recipientOptions =
    facets.facets
      .find((facet) => facet.key === "recipient")
      ?.options.map((option) => ({ value: option.value, label: option.label })) ?? [];

  // The sidebar's facets have to be scoped the same way the listing is
  // (the /shop rule in reverse): a food category here would be a checkbox
  // that empties the grid.
  const categories = allCategories.filter((category) => category.group === "craft");

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  // Counted from the listings that reached this buyer, like /shop's kitchen
  // count — a maker appears exactly when something of theirs is live here.
  const makerCount = new Set(gifts.map((gift) => gift.vendorId)).size;

  // Which dated occasions are close enough to lead the "Recommended" sort
  // (docs/GIFTING-REWORK.md D9). Decided here, once, and shipped as ids:
  // the grid is ordered in the browser, and a clock read there could
  // disagree with the server's render (the M12 React #418 rule). This page
  // is force-dynamic, so "now" is the request, not the build.
  const now = new Date();
  const upcoming = groupOccasions(occasions, now).upcoming;
  const soonOccasionIds = upcoming
    .filter(({ days }) => days <= SEASONAL_BANNER_DAYS)
    .map(({ occasion }) => occasion.id);

  /*
    The countdown is computed here and shipped as a number of days, never
    re-derived in the browser: `lib/occasions.ts` takes `now` for exactly
    this reason, and a second read of the clock during hydration is React
    #418 (the M12 lesson). This route is `force-dynamic`, so "now" is the
    request rather than the build.
  */
  const comingUp: ComingUpItem[] = upcoming
    .filter(({ days }) => days <= COMING_UP_DAYS)
    .map(({ occasion, days }) => ({
      id: occasion.id,
      slug: occasion.slug,
      name: occasion.name,
      days,
    }));

  return (
    <>
      {/*
        A compact title band (G3 §5.1.1). The photo wash is gone: it was a
        decorative band of tinted gradient carrying no information, and on
        a page whose whole job is to show handmade objects, the photograph
        belongs in the department tiles where it is a real listing's own
        picture rather than a mood. The band is under 180px on desktop, so
        the gifts start in the first screenful.
      */}
      <div className={styles.band}>
        <div className={clsx("container", "container-wide", styles.bandInner)}>
          <span className={styles.breadcrumb}>
            Home / <span className={styles.breadcrumbCurrent}>Handcrafted gifts</span>
          </span>
          <div className={styles.titleRow}>
            <h1 className={clsx(styles.title, "hk-wonk")}>
              Handcrafted <em className={styles.titleAccent}>Gifts</em>
            </h1>
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
          <ComingUp items={comingUp} />
        </div>
      </div>

      <GiftsClient
        products={gifts}
        categories={categories}
        departments={departments}
        recipient={recipient ?? ""}
        recipientOptions={recipientOptions}
        occasions={occasions}
        soonOccasionIds={soonOccasionIds}
        vendorNameById={vendorNameById}
        initialQuery={toQuery(params)}
      />
    </>
  );
}
