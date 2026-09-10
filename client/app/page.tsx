import Link from "next/link";
import clsx from "clsx";
import { PromoBand } from "@/components/ui/PromoBand";
import { Hero } from "@/components/home/Hero";
import { Ticker } from "@/components/home/Ticker";
import { HowItWorks } from "@/components/home/HowItWorks";
import { SellCta } from "@/components/home/SellCta";
import { OccasionTile } from "@/components/ui/OccasionTile";
import { SeasonalBand } from "@/components/home/SeasonalBand";
import { CategoryTile } from "@/components/ui/CategoryTile";
import { ScrollRail } from "@/components/ui/ScrollRail";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { AppInstallPanel } from "@/components/home/AppInstallPanel";
import { ReelsRailClient } from "@/components/home/ReelsRailClient";
import { QuickEntryRow } from "@/components/home/QuickEntryRow";
import { FaqSection, FAQ_ITEMS } from "@/components/home/FaqSection";
import { BestsellersTabsSection } from "@/components/home/BestsellersTabsSection";
import { quickEntryDetail } from "@/lib/data";
import type { Product } from "@/lib/types";
import {
  getCategories,
  getCollections,
  getHomePromoBands,
  getOccasions,
  getProducts,
  getReels,
  getSecondaryNav,
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
 * A minute, though, because the page reads **runtime feature flags**
 * (M17). A route's `revalidate` caps how fresh it can be, whatever the
 * underlying fetch says — so leaving this at an hour meant flipping a
 * flag opened a destination within a minute while this page carried on
 * saying "coming soon" for up to an hour. The interval follows the
 * fastest-moving thing on the page, not the slowest.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
 * Home — rebuilt from scratch in M53.
 *
 * **What changed and why.** The M51/M52 page opened on a 50/50
 * photographic split that asked "food or gifts?" before the page had
 * said what either was, and then ran a sequence of rails with no
 * argument between them. It read as a catalogue index for a product
 * whose entire proposition — *a person made this in their house* — is
 * the thing a first-time visitor has to be convinced of. This version is
 * an argument in order: what this is (hero), what is true about it
 * (ticker), the two catalogues (doors), who is cooking (kitchens), what
 * to eat and what to send (rails), what arrives (reels), how ordering
 * from a stranger's kitchen actually works (steps), and the supply-side
 * pitch that only ever lived in the footer (`<SellCta>`).
 *
 * **The order is a claim about attention, not taste.** NN/g's finding
 * that ~74% of viewing time lands in the first two screenfuls is why the
 * proposition and the two doors are both above the third, and why the
 * reels — the only genuinely persuasive asset on the page, four real
 * clips of real orders — stay high rather than sitting seventh where the
 * M52 audit found them.
 *
 * **Every number on this page is derived from the catalogue it already
 * fetched.** There is no "200+ home chefs" strip and no invented review
 * total; the two counts on the doors say exactly what was counted.
 */
export default async function Home() {
  const [occasions, categories, allProducts, vendors, promoBands, reels, collections, quickEntries] =
    await Promise.all([
      getOccasions(),
      getCategories(),
      getProducts(),
      getVendors(),
      getHomePromoBands(),
      getReels(),
      getCollections(),
      getSecondaryNav(),
    ]);

  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const vendorNames: Record<string, string> = {};
  for (const vendor of vendors) vendorNames[vendor.id] = vendor.name;

  // ── Bestsellers & Trending rails ──────────────────────────────────────
  // Admin curates four Collections with fixed slugs:
  // - bestsellers-food & bestsellers-craft
  // - trending-food & trending-craft
  // If those collections don't exist yet or are empty, fall back to top-rated products in each kind.
  const bestsellerFoodCollection = collections.find(
    (c) => c.slug === "bestsellers-food",
  );
  const bestsellerCraftCollection = collections.find(
    (c) => c.slug === "bestsellers-craft",
  );
  const trendingFoodCollection = collections.find(
    (c) => c.slug === "trending-food",
  );
  const trendingCraftCollection = collections.find(
    (c) => c.slug === "trending-craft",
  );

  const productById = new Map(allProducts.map((p) => [p.id, p]));

  function resolveCollection(
    collection: typeof bestsellerFoodCollection,
    kind: "food" | "craft",
    limit = 12,
  ): Product[] {
    if (collection && collection.productIds && collection.productIds.length > 0) {
      const resolved = collection.productIds
        .map((id) => productById.get(id))
        .filter((p): p is Product => Boolean(p))
        .slice(0, limit);
      if (resolved.length > 0) return resolved;
    }
    // Fallback: top-rated products of this kind
    const matching = allProducts.filter((p) => p.kind === kind);
    const withReviews = matching.filter((p) => p.reviewCount > 0);
    const fallbackSource = withReviews.length > 0 ? withReviews : matching;
    return fallbackSource
      .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
      .slice(0, limit);
  }

  const bestsellerFoodProducts = resolveCollection(bestsellerFoodCollection, "food");
  const bestsellerCraftProducts = resolveCollection(bestsellerCraftCollection, "craft");
  const trendingFoodProducts = resolveCollection(trendingFoodCollection, "food");
  const trendingCraftProducts = resolveCollection(trendingCraftCollection, "craft");

  // ── By HomeKrafted (In-House Brand Creations) ─────────────────────────
  // Products created and sold directly under the HomeKrafted brand label
  const hkVendor = vendors.find(
    (v) => v.name?.toLowerCase() === "homekrafted" || v.slug === "homekrafted",
  );
  const inHouseProducts = allProducts
    .filter((p) => hkVendor && p.vendorId === hkVendor.id && p.name.toLowerCase() !== "abs")
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);

  // The seasonal hook (M16). Read once, on the server, and shipped as
  // text — nothing recomputes "today" during hydration, which is the
  // failure CLAUDE.md records from M12. Absent when nothing dated is
  // close, so the band is never permanent furniture.
  const seasonal = currentSeasonalOccasion(occasions, new Date());
  const seasonalGuide = seasonal
    ? collections.find((c) => c.occasionId === seasonal.occasion.id)
    : undefined;

  // The tile grid stays at eight — it is a glance, not an index. The hub
  // (`/collections`) is where every occasion lives, which is what "All
  // occasions" means.
  //
  // Corporate is excluded here, not from the data (M35): the quick-entry
  // strip's "Corporate & bulk" tile is THE corporate entry on this page,
  // and a second tile sent the same buyer to a different destination.
  const occasionTiles = occasions.filter((o) => o.slug !== "corporate").slice(0, 8);

  /**
   * The category rail shows only categories that have a real photograph
   * (M33, owner instruction — artwork for the rest is being produced).
   *
   * A filter on `imageSrc` rather than a hardcoded list of slugs, so the
   * tiles come back **on their own** the moment art lands. Every category
   * is still reachable through "View all" (`/shop`), its own `?category=`
   * listing, and search.
   */
  const photographedCategories = categories.filter((category) => category.imageSrc);

  // Organization + WebSite + FAQPage structured data on the home page
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
          "A marketplace for homemade creations — food and snacks from real home kitchens and handcrafted gifts by independent makers.",
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
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <div className={styles.landingPage}>
      <script {...jsonLdProps(siteJsonLd)} />

      {/* ── 1. Full-Screen Hero & Ticker ── */}
      <div className={styles.heroScreen}>
        <Hero />
        <Ticker />
      </div>

      {/* ── 3. Bestsellers & Trending with Segmented Toggle ── */}
      <div className={clsx(styles.reveal, styles.afterHeroSection)}>
        <BestsellersTabsSection
          bestsellerFoodProducts={bestsellerFoodProducts}
          bestsellerCraftProducts={bestsellerCraftProducts}
          trendingFoodProducts={trendingFoodProducts}
          trendingCraftProducts={trendingCraftProducts}
          vendorNames={vendorNames}
        />
      </div>

      {/* ── 4. Bento Shortcuts ── */}
      <section className={clsx("container", "container-wide", styles.quickEntry, styles.reveal)}>
        <QuickEntryRow items={quickEntries} detail={quickEntryDetail} />
      </section>

      {/* ── 5. Seasonal Band (Festive Countdown) ── */}
      {seasonal && (
        <section className={clsx("container", "container-wide", styles.seasonal, styles.reveal)}>
          <SeasonalBand
            occasion={seasonal.occasion}
            days={seasonal.days}
            guide={seasonalGuide}
          />
        </section>
      )}

      {/* ── 6. In-House Brand Shelf ("By HomeKrafted") ── */}
      {inHouseProducts.length > 0 && (
        <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
          <div className={styles.brandShelfContainer}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>By HomeKrafted</h2>
              </div>
              <Link
                href={hkVendor ? `/storefront/${hkVendor.slug}` : "/gifts"}
                className={styles.viewAll}
              >
                Explore HomeKrafted collection →
              </Link>
            </div>
            <ScrollRail label="in-house by homekrafted" className={styles.productRail}>
              {inHouseProducts.map((product) => (
                <ProductGridCard
                  key={product.id}
                  product={product}
                  makerName={vendorNameById.get(product.vendorId) ?? "Homekrafted"}
                  href={`/product/${product.slug}`}
                />
              ))}
            </ScrollRail>
          </div>
        </section>
      )}

      {/* ── 7. Reels Stories ("See What Arrives") ── */}
      <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>From real orders</span>
            <h2 className={styles.sectionTitle}>See what arrives</h2>
          </div>
          <Link href="/shop" className={styles.viewAll}>
            Order homemade food →
          </Link>
        </div>
        <ReelsRailClient reels={reels} vendors={vendors} />
      </section>


      {/* ── 9. Categories ("What are you in the mood for" - The Visual Menu) ── */}
      <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
        <div className={styles.categoriesContainer}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Homemade food</span>
              <h2 className={styles.sectionTitle}>What are you in the mood for</h2>
            </div>
            <Link href="/shop" className={styles.viewAll}>
              All categories →
            </Link>
          </div>
          <ScrollRail label="categories" className={styles.categoryRail}>
            {photographedCategories.map((category) => (
              <CategoryTile
                key={category.id}
                category={category}
                href={`/shop?category=${category.slug}`}
              />
            ))}
          </ScrollRail>
        </div>
      </section>

      {/* ── 10. Occasions ("Someone you owe a present" - Magazine Grid) ── */}
      <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
        <div className={styles.containerSage}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Handcrafted gifts</span>
              <h2 className={styles.sectionTitle}>Someone you owe a present</h2>
            </div>
            <Link href="/collections" className={styles.viewAll}>
              All occasions →
            </Link>
          </div>
          <div className={styles.occasionGrid}>
            {occasionTiles.map((occasion) => (
              <OccasionTile
                key={occasion.id}
                occasion={occasion}
                href={`/collections/${occasion.slug}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 11. Explainer Timeline ("How this works") ── */}
      <div className={clsx(styles.explainerBand, styles.reveal)}>
        <section className={clsx("container", "container-prose", styles.section, styles.explainer)}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Ordering from a home kitchen</span>
              <h2 className={styles.sectionTitle}>How this works</h2>
            </div>
          </div>
          <HowItWorks />
        </section>
      </div>

      {/* ── 12. Asymmetric Promo Bands ── */}
      <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
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

      {/* ── 13. Frequently Asked Questions ── */}
      <section className={clsx("container", "container-wide", styles.reveal)}>
        <FaqSection />
      </section>

      {/* ── 14. Supply Side Sell CTA ── */}
      <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
        <SellCta />
      </section>

      {/* ── 15. Warm Closing App Install ── */}
      <section className={clsx("container", "container-wide", styles.section, styles.reveal)}>
        <AppInstallPanel />
      </section>
    </div>
  );
}
