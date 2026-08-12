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
        // The client-error beacon (POST only; a crawler's GET gets 405).
        // Nothing to index and no reason to spend crawl budget on it.
        "/client-errors",
        // Password reset (M18). `/reset-password` carries a single-use
        // token in the query string — a crawler following one from a
        // leaked email would burn it, and neither page has content worth
        // indexing.
        "/forgot-password",
        "/reset-password",
        // M32 — behind a login, and only ever renders for an account
        // that owes us a password. Nothing to index.
        "/set-password",
        // Corporate quotes (M20). Same reasoning as `/reset-password`, and
        // more so: the token in the path is a bearer credential for a
        // five-figure commitment, and the page contains another company's
        // pricing.
        "/corporate/quote",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
