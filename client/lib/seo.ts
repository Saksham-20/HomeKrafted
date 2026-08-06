import type { Metadata } from "next";

/**
 * SEO helpers (M15).
 *
 * Before this, two of ~65 route files exported metadata: every product,
 * every storefront and every occasion page shared one title and one
 * description, there was no sitemap, no robots file, no canonical URL and
 * no structured data. A marketplace whose entire proposition is
 * *discovering* small home kitchens was itself undiscoverable.
 *
 * `SITE_URL` has to be absolute for Open Graph, canonicals and JSON-LD —
 * relative URLs are silently ignored by crawlers and social unfurlers.
 * It comes from the environment so a staging deploy doesn't advertise
 * production URLs (and vice versa).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://homekrafted.in"
).replace(/\/$/, "");

export const SITE_NAME = "Homekrafted";

/** Default social card. A real per-product OG image needs an image pipeline — a Phase 2 item, not a launch blocker. */
const DEFAULT_OG_IMAGE = "/images/site/hero-hamper.jpg";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface PageMetaInput {
  /**
   * This page's own name, **without the brand** — `"Search"`, not
   * `"Search — Homekrafted"`. The root layout's
   * `title.template: "%s — Homekrafted"` appends it. Three pages included
   * it anyway and shipped `<title>Search — Homekrafted — Homekrafted`
   * (also `/about` and the 404), which is what a search result showed.
   */
  title: string;
  description: string;
  /** Path this page canonically lives at, e.g. `/product/mango-thokku-pickle`. */
  path: string;
  /** Absolute or root-relative image path. Falls back to the brand hamper shot. */
  image?: string;
  /** `true` for anything behind a login or per-visitor — see `robots.ts`. */
  noindex?: boolean;
  type?: "website" | "article";
}

/**
 * One page's metadata, with canonical + Open Graph + Twitter filled in
 * consistently. Every route that builds its own title should go through
 * this rather than hand-rolling a `Metadata` object, so a page can't ship
 * a title but forget the canonical.
 */
export function pageMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  type = "website",
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = image.startsWith("http") ? image : absoluteUrl(image);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      images: [{ url: imageUrl }],
      locale: "en_IN",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Renders a JSON-LD block.
 *
 * `dangerouslySetInnerHTML` is the documented way to emit JSON-LD in
 * React — a `<script type="application/ld+json">` must contain raw text,
 * and React would otherwise escape it into something no crawler parses.
 * The `<` escape guards the one sequence that could break out of the
 * script element if a product name ever contained `</script>`.
 */
export function jsonLdProps(data: Record<string, unknown>) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data).replace(/</g, "\\u003c"),
    },
  } as const;
}
