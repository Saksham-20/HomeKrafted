import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * `/robots.txt` (M15) — there wasn't one.
 *
 * Everything disallowed below is either behind a login, per-visitor, or
 * a dev surface: crawling them wastes budget and, for `/search`, mints
 * unlimited thin duplicate pages off a query parameter. The public
 * catalogue — home, shop, products, storefronts, occasions, the marketing
 * pages — is deliberately all still open.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/seller",
        "/account",
        "/cart",
        "/checkout",
        // Infinite query space, zero unique content — the results
        // themselves are all indexable at their own URLs.
        "/search",
        "/wallet",
        // Dev-only primitives gallery. Unlinked, but publicly routable.
        "/gallery",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
