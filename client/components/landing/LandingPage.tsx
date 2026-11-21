import clsx from "clsx";
import { quickEntryDetail } from "@/lib/data";
import type { Product } from "@/lib/types";
import {
  getCategories,
  getCollections,
  getHomePromoBands,
  getOccasions,
  getProducts,
  getSecondaryNav,
  getVendors,
} from "@/lib/api";
import { countdownLabel, currentSeasonalOccasion, daysUntil } from "@/lib/occasions";
import { isPurchasable } from "@/lib/catalog-availability";
import { uncuratedRail } from "@/lib/home-rails";
import { HeroTable } from "./HeroTable";
import { Waypoint } from "./Waypoint";
import { Promises } from "./Promises";
import { Register } from "./Register";
import { OccasionList, type OccasionRow } from "./OccasionList";
import { InstagramChapter } from "./InstagramChapter";
import { AppSoon } from "./AppSoon";
import { OtherWays } from "./OtherWays";
import { CategoryStickers } from "./CategoryStickers";
import { HowStory } from "./HowStory";
import { Inserts } from "./Inserts";
import { Questions } from "./Questions";
import { SellCover } from "./SellCover";
import styles from "./LandingPage.module.css";
import occasionStyles from "./OccasionSection.module.css";
import Link from "next/link";

/**
 * The landing page — "On the table" (docs/LANDING-REDESIGN.md, v2).
 *
 * Every section has its own composition and its own interaction, so no two
 * in a row share a frame: prints you can move, a split that opens toward
 * you, a sentence you can question, a list whose picture follows the
 * pointer, a story that holds still while you scroll.
 *
 * Same information as the page it replaces, with the owner's §12 copy
 * decisions applied. This component owns the data (all eight getters and
 * the collection fallbacks); the route around it owns metadata and
 * structured data.
 */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "2026-11-14" → NOV / 14, split from the string so no zone can move it. */
function dateParts(iso?: string): { month?: string; day?: string } {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return {};
  const month = MONTHS[Number(match[2]) - 1];
  return month ? { month, day: String(Number(match[3])) } : {};
}

export async function LandingPage() {
  const [occasions, categories, allProducts, vendors, promoBands, collections, quickEntries] =
    await Promise.all([
      getOccasions(),
      getCategories(),
      getProducts(),
      getVendors(),
      getHomePromoBands(),
      getCollections(),
      getSecondaryNav(),
    ]);

  const vendorNames: Record<string, string> = {};
  for (const vendor of vendors) vendorNames[vendor.id] = vendor.name;

  const productById = new Map(allProducts.map((product) => [product.id, product]));
  const isLive = (product?: Product): product is Product => Boolean(product && isPurchasable(product));

  // Admin-curated collections with fixed slugs; when one is missing or
  // empty, the admin's featured listings then the top-rated (home-rails).
  function resolveCollection(slug: string, kind: "food" | "craft", limit = 12): Product[] {
    const collection = collections.find((item) => item.slug === slug);
    if (collection?.productIds?.length) {
      const resolved = collection.productIds
        .map((id) => productById.get(id))
        .filter(isLive)
        .slice(0, limit);
      if (resolved.length > 0) return resolved;
    }
    return uncuratedRail(
      allProducts.filter((product) => product.kind === kind && isLive(product)),
      limit,
    );
  }

  const lists = {
    bestsellers: {
      food: resolveCollection("bestsellers-food", "food"),
      craft: resolveCollection("bestsellers-craft", "craft"),
    },
    trending: {
      food: resolveCollection("trending-food", "food"),
      craft: resolveCollection("trending-craft", "craft"),
    },
  };

  // Occasions: eight, corporate excluded (the "Other ways in" note is the
  // corporate door). Countdown text is computed here, once, and shipped as
  // a string.
  const now = new Date();
  const seasonal = currentSeasonalOccasion(occasions, now);
  const occasionRows: OccasionRow[] = occasions
    .filter((occasion) => occasion.slug !== "corporate")
    .slice(0, 8)
    .map((occasion) => {
      const days = occasion.celebratedOn ? daysUntil(occasion.celebratedOn, now) : undefined;
      return {
        id: occasion.id,
        slug: occasion.slug,
        name: occasion.name,
        tagline: occasion.tagline,
        when: days === undefined ? "Any day" : days >= 0 ? countdownLabel(days) : undefined,
        soon: seasonal?.occasion.id === occasion.id,
        ...dateParts(occasion.celebratedOn),
      };
    });

  const otherWays = quickEntries.map((entry) => ({
    href: entry.href,
    title: quickEntryDetail[entry.href]?.title ?? entry.label,
    blurb: quickEntryDetail[entry.href]?.blurb,
  }));
  // Two full rows of six; the rest are one press away under "All categories".
  const photographedCategories = categories.filter((category) => category.imageSrc).slice(0, 12);

  return (
    <div className={styles.root}>
      <HeroTable />
      <Waypoint label="Come on in" />
      <div className={styles.shelfSheet}>
        <Register lists={lists} vendorNames={vendorNames} />
      </div>

      <div className={styles.proofSheet}>
        <InstagramChapter />
      </div>

      <Waypoint label="Who is it for?" />
      <section
        className={clsx("lp-rise", occasionStyles.section, styles.duskSheet)}
        aria-labelledby="lp-occasions-title"
      >
        <div className={clsx("container", occasionStyles.inner)}>
          <div className={occasionStyles.head}>
            <h2 id="lp-occasions-title" className={occasionStyles.title}>
              Someone you owe a present
            </h2>
            <Link href="/collections" className={occasionStyles.all}>
              All occasions →
            </Link>
          </div>
          <OccasionList rows={occasionRows} />
        </div>
      </section>

      <Waypoint label="Before you buy" />
      <div className={styles.promiseSheet}>
        <Promises />
      </div>
      <HowStory />
      <div className={styles.appSheet}>
        <AppSoon />
      </div>
      <div className={styles.waysSheet}>
        <OtherWays items={otherWays} />
      </div>
      <div className={styles.paperSheet}>
        <CategoryStickers categories={photographedCategories} />
        <Inserts bands={promoBands} />
        <Questions />
      </div>
      <SellCover />
    </div>
  );
}
