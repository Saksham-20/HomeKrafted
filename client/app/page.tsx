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
import { MakerCard } from "@/components/home/MakerCard";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { AppInstallPanel } from "@/components/home/AppInstallPanel";
import { ReelsRailClient } from "@/components/home/ReelsRailClient";
import { QuickEntryRow } from "@/components/home/QuickEntryRow";
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

  /**
   * Each kitchen's best-rated listing.
   *
   * Derived from the products already fetched rather than a per-vendor
   * API call: extra round trips to render a rail of cards is not a trade
   * worth making, and the catalogue is loaded here anyway.
   */
  const bestsellerByVendor = new Map<string, Product>();
  for (const product of allProducts) {
    const held = bestsellerByVendor.get(product.vendorId);
    if (!held || product.rating > held.rating) bestsellerByVendor.set(product.vendorId, product);
  }

  // The platform's own vendor (M44: `homekrafted`, the one an admin lists
  // on behalf of a cook who can't face the form) is not one of "the
  // people cooking" — a section about people should not seat the company
  // in one of its slots.
  const realVendors = vendors.filter((vendor) => vendor.slug !== "homekrafted");

  const makers = realVendors
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

  /**
   * The "most loved" rail — the best-rated listings that have actually
   * been reviewed.
   *
   * `reviewCount > 0` is the whole filter and it is doing real work: an
   * unreviewed listing carries `rating: 0`, so sorting the raw catalogue
   * by rating would rank every new listing last and a tie of zeros
   * first, depending which way the sort fell. A rail called "most loved"
   * has to be listings somebody loved.
   */
  const loved = allProducts
    .filter((product) => product.reviewCount > 0)
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
    .slice(0, 10);

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

  // Organization + WebSite structured data, on the home page only —
  // stating it once site-wide is what the spec expects, and repeating it
  // per route just bloats every document. `SearchAction` is what lets a
  // search engine offer a Homekrafted search box directly in results.
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
          "A marketplace for homemade creations — food and snacks from real home kitchens delivered across the Chandigarh tricity, and handcrafted gifts posted anywhere in India.",
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

      <Hero />

      {/* Full-bleed on purpose — it is a rule under the hero, not a card
          inside the grid. */}
      <Ticker />

      {/*
        M34 — the ways in that the desktop nav gave up so its search field
        could be typable, plus Snacks on WhatsApp, which was never in the
        nav at all. Directly under the hero's two halves: this is the
        "anything else?" row, and it only makes sense after the page's
        two main answers.
      */}
      <section className={clsx("container", styles.quickEntry)}>
        <QuickEntryRow items={quickEntries} detail={quickEntryDetail} />
      </section>

      {seasonal && (
        <section className={clsx("container", styles.seasonal)}>
          <SeasonalBand
            occasion={seasonal.occasion}
            days={seasonal.days}
            guide={seasonalGuide}
          />
        </section>
      )}

      {/*
        M20 put people on the home page for the first time; M53 moved them
        up to third. The platform's thesis is trusting a stranger's
        kitchen, so the cook is the most persuasive thing on the page and
        was rendering below four rails of jars.
      */}
      {makers.length > 0 && (
        <section className={clsx("container", styles.section)}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Real people, real kitchens</span>
              <h2 className={styles.sectionTitle}>Who is cooking</h2>
            </div>
            <Link href="/shop" className={styles.viewAll}>
              All kitchens →
            </Link>
          </div>
          <div className={clsx(styles.makersGrid, "hk-scroll")}>
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

      {/*
        M53 — the reels stay in the top third (M52's finding) but sit
        after the makers now: "here are the people" then "here is what
        turns up" is an argument, where the reverse was two unrelated
        rails. Framed as what arrives, not "watch it being made": the
        clips show tiffins landing, not kadais.
      */}
      <section className={clsx("container", styles.section)}>
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

      {loved.length > 0 && (
        <section className={clsx("container", styles.section)}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Reviewed by people who ate it</span>
              <h2 className={styles.sectionTitle}>Ordered again and again</h2>
            </div>
            <Link href="/shop" className={styles.viewAll}>
              All products →
            </Link>
          </div>
          <ScrollRail label="most loved listings" className={styles.productRail}>
            {loved.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNameById.get(product.vendorId) ?? "Homekrafted"}
                href={`/product/${product.slug}`}
              />
            ))}
          </ScrollRail>
        </section>
      )}

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <div>
            {/* Every photographed category is food (M33) — the eyebrow
                says so, rather than promising a category rail for the
                gifts half that is not there yet. */}
            <span className={styles.eyebrow}>Homemade food</span>
            <h2 className={styles.sectionTitle}>What are you in the mood for</h2>
          </div>
          <Link href="/shop" className={styles.viewAll}>
            All categories →
          </Link>
        </div>
        {/* `ScrollRail` owns the scrollbar, the edge fades and the arrows;
            `.categoryRail` is only this rail's gap and tile sizing. */}
        <ScrollRail label="categories" className={styles.categoryRail}>
          {photographedCategories.map((category) => (
            <CategoryTile
              key={category.id}
              category={category}
              href={`/shop?category=${category.slug}`}
            />
          ))}
        </ScrollRail>
      </section>

      <section className={clsx("container", styles.section)}>
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
      </section>

      {/* The objection an unfamiliar visitor arrives with, answered where
          they have just seen enough to have it.

          It is the one section on its own ground. Everything above it is
          a rail of things to look at on the page's canvas, and eight of
          those in a row read as one long list whatever the headings say;
          this is the section that stops and explains, so the page stops
          with it. See `.explainerBand`. */}
      <div className={styles.explainerBand}>
        <section className={clsx("container", styles.section, styles.explainer)}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Ordering from a home kitchen</span>
              <h2 className={styles.sectionTitle}>How this works</h2>
            </div>
          </div>
          <HowItWorks />
        </section>
      </div>

      {/* Admin-editable copy (M11b `/admin/collections`) — see
          `getHomePromoBands`. */}
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

      {/* The supply side. A two-sided marketplace whose home page never
          addressed the supply half was leaving the harder side of the
          problem to the footer. */}
      <section className={clsx("container", styles.section)}>
        <SellCta />
      </section>

      <section className={clsx("container", styles.section)}>
        <AppInstallPanel />
      </section>
    </>
  );
}
