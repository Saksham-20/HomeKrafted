import { HomePage } from "@/components/homepage/HomePage";
import { absoluteUrl, jsonLdProps, SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * Rebuilt every request rather than pinned at build time.
 *
 * The bestseller row reads live stock and availability, and the header it
 * sits under reads **runtime feature flags** (M17) — food orders open or
 * closed — which an hour of `revalidate` would leave saying the wrong
 * thing long after an admin flipped the switch or a listing sold out. The
 * freshness follows the fastest-moving thing on the page.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Home — the client's seasonal mockup (2026-11-24; replaces "On the
 * table", which stays in `components/landing/` until the client signs this
 * one off).
 *
 * The page, its data and its sections live in `components/homepage/`;
 * this route owns only its freshness and its structured data:
 * Organization + WebSite. The FAQPage node went with the old page's
 * visible questions — structured data has to describe what is on the page.
 */
export default function Home() {
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
    ],
  };

  return (
    <>
      <script {...jsonLdProps(siteJsonLd)} />
      <HomePage />
    </>
  );
}
