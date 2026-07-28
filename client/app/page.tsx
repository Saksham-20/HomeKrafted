import Link from "next/link";
import clsx from "clsx";
import { PromoBand } from "@/components/ui/PromoBand";
import { Hero } from "@/components/home/Hero";
import { OccasionTileLink } from "@/components/home/OccasionTileLink";
import { CategoryTileLink } from "@/components/home/CategoryTileLink";
import { CraftCard } from "@/components/home/CraftCard";
import { AppInstallPanel } from "@/components/home/AppInstallPanel";
import { ReelsRailClient } from "@/components/home/ReelsRailClient";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import {
  getCategories,
  getFeatured,
  getHomePromoBands,
  getOccasions,
  getReels,
  getTrustStats,
  getVendors,
} from "@/lib/api";
import styles from "./page.module.css";

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
  const [trustStats, occasions, categories, featured, vendors, promoBands, reels] =
    await Promise.all([
      getTrustStats(),
      getOccasions(),
      getCategories(),
      getFeatured(),
      getVendors(),
      getHomePromoBands(),
      getReels(),
    ]);

  const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));

  return (
    <>
      <Hero trustStats={trustStats} />

      <section className={clsx("container", styles.section)}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Shop by occasion</h2>
          <Link href="/shop" className={styles.viewAll}>
            View all →
          </Link>
        </div>
        <div className={styles.occasionGrid}>
          {occasions.map((occasion) => (
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
