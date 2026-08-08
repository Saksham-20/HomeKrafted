import { AboutClient } from "@/components/about/AboutClient";
import { getAboutContent } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

/**
 * Hand-rolled as a bare `Metadata` object until the 2026-08-07 audit,
 * which is the exact failure `CLAUDE.md`'s SEO rule names: no `path`
 * means no `alternates.canonical`, so this page inherited the root
 * layout's — telling every search engine that `/about` is a duplicate of
 * the home page and should be dropped in its favour. The only public
 * route on the site with a wrong canonical, and invisible on the page.
 */
export const metadata = pageMetadata({
  title: "About",
  description:
    "Homekrafted is more than just a food delivery platform. We are a movement that supports home makers, bakers, and artists in transforming their passion into a thriving business.",
  path: "/about",
});

/**
 * `/about` — brand story, mission, offerings, team and contact. Carried
 * over from the marketing site at homekrafted.in that this app replaces;
 * see `lib/data/about.ts` for what is verbatim and what was updated.
 */
export default async function AboutPage() {
  const content = await getAboutContent();
  return <AboutClient content={content} />;
}
