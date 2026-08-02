import Link from "next/link";
import clsx from "clsx";
import { PromoBand } from "@/components/ui/PromoBand";
import { Hero } from "@/components/home/Hero";
import { OccasionTileLink } from "@/components/home/OccasionTileLink";
import { SeasonalBand } from "@/components/home/SeasonalBand";
import { CategoryTileLink } from "@/components/home/CategoryTileLink";
import { CraftCard } from "@/components/home/CraftCard";
import { AppInstallPanel } from "@/components/home/AppInstallPanel";
import { ReelsRailClient } from "@/components/home/ReelsRailClient";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import {
  getCategories,
  getCollections,
  getFeatured,
  getHomePromoBands,
  getOccasions,
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
  const [trustStats, occasions, categories, featured, vendors, promoBands, reels, collections] =
    await Promise.all([
      getTrustStats(),
      getOccasions(),
      getCategories(),
      getFeatured(),
      getVendors(),
      getHomePromoBands(),
      getReels(),
      getCollections(),
    ]);

  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));

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
          <h2 className={styles.sectionTitle}>Shop by occasion</h2>
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
          <h2 className={styles.sectionTitle}>Shop by category</h2>
        </div>
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <CategoryTileLink key={category.id} category={category} />
          ))}
        </div>
      </section>

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>This week&rsquo;s small batches</h2>
          <Link href="/shop" className={styles.viewAll}>
            All products →
          </Link>
        </div>
        <div className={styles.featuredGrid}>
          {featured.map((product) => (
            <ProductGridCard
              key={product.id}
              product={product}
              makerName={vendorNameById.get(product.vendorId) ?? "Homekrafted"}
              href={`/product/${product.slug}`}
            />
          ))}
        </div>
      </section>

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.reelsEyebrow}>Reels</span>
            <h2 className={styles.sectionTitle}>Straight from the kitchen</h2>
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

      <section className={clsx("container", styles.section)}>
        <div className={styles.servicesIntro}>
          <span className={styles.servicesEyebrow}>More from Homekrafted</span>
          <h2 className={styles.servicesTitle}>One home, three crafts</h2>
        </div>
        <div className={styles.servicesGrid}>
          <CraftCard
            variant="laundry"
            channel="laundry"
            title={
              <>
                Laundry &amp;
                <br />
                Cleaning
              </>
            }
            description="Wash, dry-clean, ironing and home deep-cleaning with free doorstep pickup & delivery. Schedule a slot and pay online — wallet accepted."
          />
          <CraftCard
            variant="food"
            channel="full-meals"
            title={
              <>
                Food
                <br />
                Delivery
              </>
            }
            description="Hot home-cooked meals from local kitchens with real-time order & rider tracking — available only on the Homekrafted app."
          />
        </div>
        <div className={styles.servicesGrid}>
          <CraftCard
            variant="snacks"
            channel="snacks"
            title="Browse snacks, order on chat"
            description="Pick from today's home-snack menu and send your list on WhatsApp — no checkout needed."
          />
          <AppInstallPanel />
        </div>
      </section>
    </>
  );
}
