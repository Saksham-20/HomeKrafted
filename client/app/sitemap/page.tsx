import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { SITEMAP_GROUPS } from "@/lib/policies";

export const metadata = pageMetadata({
  title: "Homekrafted Sitemap",
  description:
    "Every public page on Homekrafted in one place — food, gifting, support, policies for shoppers and sellers.",
  path: "/sitemap",
});

/**
 * The human-readable sitemap the client asked for. **Not** `/sitemap.xml`
 * (`app/sitemap.ts`), which is the crawler's and is built from the live
 * catalogue; this page is the fixed set of pages a person can navigate to.
 * Groups and labels come from `lib/policies`, the same list the footer is
 * built from, so the two cannot drift.
 */
export default function SitemapPage() {
  return (
    <LegalPage
      title="Homekrafted Sitemap"
      intro="Every public page on Homekrafted, grouped the way the footer is."
    >
      {SITEMAP_GROUPS.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {group.links.map((link) => (
              <li key={link.href + link.label}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </LegalPage>
  );
}
