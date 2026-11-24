import { getCategories, getCollections, getProducts, getVendors } from "@/lib/api";
import { isPurchasable } from "@/lib/catalog-availability";
import { uncuratedRail } from "@/lib/home-rails";
import { interleave } from "@/lib/landing/register";
import { SEASON, seasonDoorHref, type SeasonDoor } from "@/lib/season";
import type { Product } from "@/lib/types";
import { SeasonHero } from "./SeasonHero";
import { MoodTiles } from "./MoodTiles";
import { EditBand } from "./EditBand";
import { BestsellerRail } from "./BestsellerRail";
import { PromoPair } from "./PromoPair";
import { RecipientRow } from "./RecipientRow";
import styles from "./HomePage.module.css";

/**
 * The home page — the client's seasonal mockup (2026-11-24), built from
 * the catalogue rather than from the mockup's invented listings.
 *
 * Words and pictures come from `lib/season.ts`. Products come
 * from the live catalogue: the admin's "bestsellers" collections when
 * they exist and have live listings, otherwise featured-then-top-rated
 * (`home-rails`), the same fallback the page before this one used. A
 * catalogue with nothing live shows no bestseller row at all rather than
 * an empty frame.
 */
export async function HomePage() {
  const [categories, allProducts, vendors, collections] = await Promise.all([
    getCategories(),
    getProducts(),
    getVendors(),
    getCollections(),
  ]);

  const liveShelves = new Set(categories.filter((category) => !category.archivedAt).map((category) => category.slug));
  const vendorNames = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const productById = new Map(allProducts.map((product) => [product.id, product]));
  const isLive = (product?: Product): product is Product => Boolean(product && isPurchasable(product));

  function resolveCollection(slug: string, kind: "food" | "craft", limit: number): Product[] {
    const collection = collections.find((item) => item.slug === slug);
    const curated = (collection?.productIds ?? [])
      .map((id) => productById.get(id))
      .filter(isLive)
      .slice(0, limit);
    if (curated.length > 0) return curated;
    return uncuratedRail(
      allProducts.filter((product) => product.kind === kind && isLive(product)),
      limit,
    );
  }

  const bestsellers = interleave(
    resolveCollection("bestsellers-craft", "craft", 6),
    resolveCollection("bestsellers-food", "food", 6),
  ).map((product) => ({ product, makerName: vendorNames.get(product.vendorId) ?? "" }));

  const withHref = (door: SeasonDoor) => ({ ...door, href: seasonDoorHref(door, liveShelves) });

  return (
    <div className={styles.root}>
      <SeasonHero />
      <MoodTiles title={SEASON.mood.title} subtitle={SEASON.mood.subtitle} doors={SEASON.mood.doors.map(withHref)} />
      <EditBand
        anchor={SEASON.anchor}
        kicker={SEASON.edit.kicker}
        title={SEASON.edit.title}
        more={SEASON.edit.more}
        doors={SEASON.edit.doors.map(withHref)}
      />
      {bestsellers.length > 0 && (
        <BestsellerRail title={SEASON.bestsellers.title} more={SEASON.bestsellers.more} items={bestsellers} />
      )}
      <PromoPair promos={SEASON.promos} />
      <RecipientRow title={SEASON.recipients.title} recipients={SEASON.recipients.list} mealPlans={SEASON.mealPlans} />
    </div>
  );
}
