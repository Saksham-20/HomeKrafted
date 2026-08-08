import Link from "next/link";
import clsx from "clsx";
import { PromoBand } from "@/components/ui/PromoBand";
import { Hero } from "@/components/home/Hero";
import { OccasionTileLink } from "@/components/home/OccasionTileLink";
import { SeasonalBand } from "@/components/home/SeasonalBand";
import { CategoryTileLink } from "@/components/home/CategoryTileLink";
import { MakerCard } from "@/components/home/MakerCard";
import { WayCard } from "@/components/home/WayCard";
import { AppInstallPanel } from "@/components/home/AppInstallPanel";
import { ReelsRailClient } from "@/components/home/ReelsRailClient";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { backedBy, waysToOrder } from "@/lib/data";
import type { Product } from "@/lib/types";
import {
  getCategories,
  getCollections,
  getHomePromoBands,
  getOccasions,
  getProducts,
  getReels,
  getTrustStats,
  getVendors,
} from "@/lib/api";
import { currentSeasonalOccasion } from "@/lib/occasions";
import { absoluteUrl, jsonLdProps, SITE_NAME, SITE_URL } from "@/lib/seo";
import styles from "./page.module.css";

/**
 * Rebuilt every minute rather than pinned at build time.
 *
 * Two reasons, and the shorter one wins. The seasonal countdown (M16) is
 * why this isn't static at all: a prerendered page would freeze "Raksha
 * Bandhan in 27 days" at whatever the number was when the build ran, and
 * an hour was well inside the day granularity it works at.
 *
 * A minute, though, because the hero's hamper CTA reads a **runtime
 * feature flag** (M17). A route's `revalidate` caps how fresh it can be,
 * whatever the underlying fetch says — so leaving this at an hour meant
 * flipping the flag opened `/hamper` within a minute while this page
 * carried on saying "coming soon" for up to an hour. That is the exact
 * half-open state the runtime flags exist to prevent, so the interval
 * follows the fastest-moving thing on the page, not the slowest.
 */
export const revalidate = 60;

/** Splits a `HomePromoBandContent.title` on its literal `"\n"` line break into React fragments joined by `<br />` — see that type's doc comment (`lib/data/site.ts`). */
function renderPromoTitle(title: string) {
  const lines = title.split("\n");
  return lines.map((line, index) => (
    <span key={index}>
      {line}
      {index < lines.length - 1 && <br />}
    </span>
  ));
}

/**
 * Home — full port of the prototype's store-first Home (M2). Hero, shop by
 * occasion, shop by category, "this week's small batches" featured rail,
 * hamper + wallet promo bands, "One home, three crafts" services band
 * (Laundry/Food Delivery/Snacks) and the app-install panel. Replaces the
 * M0 placeholder. Promo band copy is admin-editable (M11b `/admin/collections`)
 * — see `getHomePromoBands`.
 */
export default async function Home() {
  const [trustStats, occasions, categories, allProducts, vendors, promoBands, reels, collections] =
    await Promise.all([
      getTrustStats(),
      getOccasions(),
      getCategories(),
      getProducts(),
      getVendors(),
      getHomePromoBands(),
      getReels(),
      getCollections(),
    ]);

  const ways = waysToOrder;
  const backers = backedBy;

  /**
   * The four kitchens behind "Meet the Hands Behind the Flavours", each
   * with their best-rated listing.
   *
   * Derived from the products already fetched rather than a per-vendor API
   * call: four extra round trips to render four cards is not a trade worth
   * making, and the catalogue is loaded here anyway.
   *
   * Kitchens with something listed come first. A vendor with nothing live
   * still renders — `MakerCard` says so in words — but it should not
   * displace one that has a bestseller to show.
   */
  const bestsellerByVendor = new Map<string, Product>();
  for (const product of allProducts) {
    const held = bestsellerByVendor.get(product.vendorId);
    if (!held || product.rating > held.rating) bestsellerByVendor.set(product.vendorId, product);
  }

  const makers = vendors
    .slice()
    .sort((a, b) => {
      const aHas = bestsellerByVendor.has(a.id) ? 1 : 0;
      const bHas = bestsellerByVendor.has(b.id) ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return b.rating - a.rating;
    })
    .slice(0, 4)
    .map((vendor) => {
      const bestseller = bestsellerByVendor.get(vendor.id);
      // The price shown is the default weight option's, matching what a
      // product card shows — not the cheapest, which would undercut the
      // number the buyer sees one click later.
      const option =
        bestseller?.weightOptions.find((w) => w.sku === bestseller.defaultWeightSku) ??
        bestseller?.weightOptions[0];
      return { vendor, bestseller, bestsellerPrice: option?.price };
    });

  // The seasonal hook (M16). Read once, on the server, and shipped as
  // text — nothing recomputes "today" during hydration, which is the
  // failure CLAUDE.md records from M12. Absent when nothing dated is
  // close, so the band is never permanent furniture.
  const seasonal = currentSeasonalOccasion(occasions, new Date());
  const seasonalGuide = seasonal
    ? collections.find((c) => c.occasionId === seasonal.occasion.id)
    : undefined;

  // The tile grid stays at eight — it is a glance, not an index. The hub
  // (`/collections`, new in M16) is where every occasion lives, which is
  // what "View all" now actually means.
  const occasionTiles = occasions.slice(0, 8);

  // Organization + WebSite structured data, on the home page only —
  // stating it once site-wide is what the spec expects, and repeating it
  // per route just bloats every document. `SearchAction` is what lets a
  // search engine offer a Homekrafted search box directly in results; it
  // points at the real `/search` route added in the same milestone.
  const siteJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/images/site/logo.svg"),
        description:
          "A marketplace for homemade creations — gifts, foods, snacks and home services from real home kitchens across the Chandigarh tricity.",
        areaServed: ["Chandigarh", "Mohali", "Panchkula", "Zirakpur"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <>
      <script {...jsonLdProps(siteJsonLd)} />
      <Hero trustStats={trustStats} />

      {seasonal && (
        <section className={clsx("container", styles.seasonal)}>
          <SeasonalBand
            occasion={seasonal.occasion}
            days={seasonal.days}
            guide={seasonalGuide}
          />
        </section>
      )}

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            Thoughtful Handkrafted Gifts for Every Occasion
          </h2>
          <Link href="/collections" className={styles.viewAll}>
            View all →
          </Link>
        </div>
        <div className={styles.occasionGrid}>
          {occasionTiles.map((occasion) => (
            <OccasionTileLink key={occasion.id} occasion={occasion} />
          ))}
        </div>
      </section>

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Explore Homemade Favourites</h2>
          <Link href="/shop" className={styles.viewAll}>
            View all →
          </Link>
        </div>
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <CategoryTileLink key={category.id} category={category} />
          ))}
        </div>
      </section>

      {/*
        M20: this slot was "This week's small batches", a rail of products.
        It is now a rail of *people*.

        That is the point of the change rather than a re-skin: the platform's
        whole thesis is trusting a stranger's kitchen, and the home page
        never showed a cook. `getFeatured` still exists and still feeds
        `/shop` — nothing was deleted to make room.
      */}
      {makers.length > 0 && (
        <section className={clsx("container", styles.section)}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Meet the Hands Behind the Flavours</h2>
            <Link href="/shop" className={styles.viewAll}>
              All products →
            </Link>
          </div>
          <div className={styles.makersGrid}>
            {makers.map(({ vendor, bestseller, bestsellerPrice }) => (
              <MakerCard
                key={vendor.id}
                vendor={vendor}
                bestseller={bestseller}
                bestsellerPrice={bestsellerPrice}
              />
            ))}
          </div>
        </section>
      )}

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.reelsEyebrow}>Reels</span>
            <h2 className={styles.sectionTitle}>Homemade on Your Feed</h2>
          </div>
          <Link href="/shop" className={styles.viewAll}>
            Shop what you see →
          </Link>
        </div>
        <ReelsRailClient reels={reels} vendors={vendors} />
      </section>

      <section className={clsx("container", styles.section)}>
        <div className={styles.bandsGrid}>
          {promoBands.map((band) => (
            <PromoBand
              key={band.id}
              variant={band.variant}
              eyebrow={band.eyebrow}
              title={renderPromoTitle(band.title)}
              description={band.description}
              ctaLabel={band.ctaLabel}
              ctaHref={band.ctaHref}
            />
          ))}
        </div>
      </section>

      {/*
        M20 — "Homemade, Your Way", replacing the M19 two-card services
        grid. That grid was itself a repair after laundry was pulled out of
        a hard-coded three-card row and left a hole, which is exactly why
        this one renders from `waysToOrder` in `lib/data/site.ts`: the next
        thing that goes away should be a deleted array entry, not a layout
        bug someone has to notice.
      */}
      <section className={clsx("container", styles.section)}>
        <div className={styles.servicesIntro}>
          <span className={styles.servicesEyebrow}>More from Homekrafted</span>
          <h2 className={styles.servicesTitle}>Homemade, Your Way</h2>
        </div>
        <div className={styles.waysGrid}>
          {ways.map((way) => (
            <WayCard key={way.id} way={way} />
          ))}
        </div>
        <div className={styles.servicesPanel}>
          <AppInstallPanel />
        </div>

        {/*
          Institutional claims, with the organisations' marks as of M24.

          Each mark sits on a white tile because all three supplied files are
          JPEGs with a baked near-white background: against the `#F4F3F0`
          canvas those backgrounds would read as three accidental rectangles,
          whereas on a card they read as the design system's own card
          treatment. It also means the letterboxing inside the CGC file
          disappears instead of having to be cropped out of somebody's logo.

          A backer with no `logoSrc` still renders — as its sentence alone,
          which is what the whole strip was before M24. See `backedBy` in
          `lib/data/site.ts` for the two editing rules and the standing
          "confirm these relationships in writing" warning.
        */}
        <div className={styles.backedBy}>
          <span className={styles.backedByLabel}>Backed by</span>
          <ul className={styles.backerRow}>
            {backers.map((backer) => (
              <li key={backer.id} className={styles.backer}>
                {backer.logoSrc && backer.logoRatio ? (
                  <span className={clsx(styles.backerMark, styles[backer.id])}>
                    <ImageSlot
                      ratio={backer.logoRatio}
                      label={backer.label}
                      alt={backer.logoAlt ?? backer.label}
                      src={backer.logoSrc}
                      sizes={backer.logoSizes}
                    />
                  </span>
                ) : null}
                <span className={styles.backerDetail}>{backer.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
