import { LandingPage } from "@/components/landing/LandingPage";
import { FAQ_ITEMS } from "@/lib/landing/faq";
import { absoluteUrl, jsonLdProps, SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * Rebuilt every request rather than pinned at build time.
 *
 * The occasions list carries countdowns ("in 12 days"), which a prerender
 * would freeze at whatever they were when the build ran, and the page reads
 * **runtime feature flags** (M17) — food orders open or closed — which an
 * hour of `revalidate` would leave saying the wrong thing long after an
 * admin flipped the switch. The freshness follows the fastest-moving thing
 * on the page.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Home — "On the table" (2026-09-23, docs/LANDING-REDESIGN.md v2).
 *
 * The page itself, its data and every section live in
 * `components/landing/`; this route owns only what a route should: its
 * freshness and its structured data. Organization + WebSite + FAQPage, the
 * last read from the same list the visible questions render
 * (`lib/landing/faq.ts`), so the two cannot drift.
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
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script {...jsonLdProps(siteJsonLd)} />
      <LandingPage />
    </>
  );
}
