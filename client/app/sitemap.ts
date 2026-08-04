import type { MetadataRoute } from "next";
import { getCategories, getCollections, getOccasions, getProducts, getVendors } from "@/lib/api";
import { absoluteUrl } from "@/lib/seo";

/**
 * `/sitemap.xml` (M15) — there wasn't one, so every product and every
 * HomeKrafter storefront was reachable only by a crawler following links
 * from `/shop`.
 *
 * Built from the live catalogue rather than a hardcoded list, so a new
 * kitchen's storefront and its listings are submittable the day they're
 * approved. Deliberately **not** location-filtered: a sitemap is for
 * crawlers, which have no delivery address, and filtering it would hide
 * most of the catalogue from search for no reason.
 *
 * `revalidate` keeps this from re-querying the catalogue on every crawler
 * hit while still picking up new listings within the hour.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // The stable pages, highest intent first. Anything behind a login or
  // per-visitor is excluded here and disallowed in `robots.ts`.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/shop"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/snacks"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    // The occasion hub (M16) — the seasonal landing page, and the one
    // that should rank for "diwali gift" rather than any single edit.
    { url: absoluteUrl("/collections"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/sell"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/corporate"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/app-promo"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/support"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    // Policy pages (M18). Indexable on purpose: "homekrafted refund
    // policy" is a real query from somebody with a problem, and a payment
    // provider checks these are publicly reachable.
    { url: absoluteUrl("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/refunds"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/contact"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const [products, vendors, occasions, categories, guides] = await Promise.all([
      getProducts(),
      getVendors(),
      getOccasions(),
      getCategories(),
      getCollections(),
    ]);

    return [
      ...staticEntries,
      ...products.map((product) => ({
        url: absoluteUrl(`/product/${product.slug}`),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...vendors.map((vendor) => ({
        url: absoluteUrl(`/storefront/${vendor.slug}`),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...occasions.map((occasion) => ({
        url: absoluteUrl(`/collections/${occasion.slug}`),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...guides.map((guide) => ({
        url: absoluteUrl(`/guides/${guide.slug}`),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      // `/shop?category=` isn't its own route, but it is a real landing
      // page for "gifts for a housewarming"-shaped queries.
      ...categories.map((category) => ({
        url: absoluteUrl(`/shop?category=${category.slug}`),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // A sitemap that 500s because the API blinked is worse than one
    // listing only the pages we already know: crawlers treat a failed
    // fetch as a reason to back off the whole file.
    return staticEntries;
  }
}
