import clsx from "clsx";
import { OccasionCard } from "@/components/occasion/OccasionCard";
import { GuideCard } from "@/components/occasion/GuideCard";
import { getCollections, getOccasions } from "@/lib/api";
import { groupOccasions } from "@/lib/occasions";
import { pageMetadata } from "@/lib/seo";
import styles from "./Hub.module.css";

/**
 * Rebuilt every minute, not pinned at build time — the countdowns on this
 * page are its whole point, and a static prerender would freeze them at
 * whatever the numbers were when the build ran.
 *
 * An hour would be well inside the day granularity `groupOccasions` works
 * at; a minute keeps it in step with the rest of the site, which now
 * revalidates on that interval so a runtime feature flag can't leave one
 * page disagreeing with another (see `app/page.tsx`).
 */
export const revalidate = 60;

export const metadata = pageMetadata({
  title: "Gifts by occasion",
  description:
    "What is coming up, and what to send. Diwali, Raksha Bandhan, weddings and everyday thank-yous, from home kitchens across the Chandigarh tricity.",
  path: "/collections",
});

/**
 * `/collections` — the occasion hub (M16, H8).
 *
 * Occasions and curated `Collection`s both existed before this, but the
 * only way to reach either was to already know an occasion's slug: the
 * home page's "Shop by occasion / View all →" pointed at `/shop`, and a
 * guide not attached to an occasion had no page at all. For a gifting
 * marketplace, "what is coming up" is the strongest seasonal hook there
 * is, and it was unexploited.
 *
 * **The clock is read exactly once, here.** `groupOccasions` takes `now`
 * as an argument and never calls `new Date()` itself, so the countdown
 * is computed on the server and shipped as text. Nothing recomputes it
 * during hydration — which is the failure CLAUDE.md records from M12
 * (React #418: server and browser disagreeing about "today").
 */
export default async function OccasionHubPage() {
  const [occasions, collections] = await Promise.all([getOccasions(), getCollections()]);
  const { upcoming, evergreen } = groupOccasions(occasions, new Date());

  // Guides are already in the merchandiser's running order from the API;
  // featured ones lead. `passed` occasions are deliberately not rendered —
  // an admin rolling the date forward is what brings one back.
  const guides = [...collections].sort(
    (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  );

  return (
    <div className={styles.page}>
      <section className={clsx("container", styles.intro)}>
        <p className={styles.eyebrow}>Gifts by occasion</p>
        <h1 className={styles.title}>What&rsquo;s coming up</h1>
        <p className={styles.lede}>
          Home kitchens work to their own lead times — a jar of pickle is not a same-day purchase
          and a festival order is not a next-day one. This is what is close, and what is worth
          ordering now.
        </p>
      </section>

      {upcoming.length > 0 && (
        <section className={clsx("container", styles.section)}>
          <h2 className={styles.sectionTitle}>Coming up</h2>
          <div className={styles.occasionList}>
            {upcoming.map(({ occasion, days }) => (
              <OccasionCard key={occasion.id} occasion={occasion} days={days} />
            ))}
          </div>
        </section>
      )}

      {guides.length > 0 && (
        <section className={clsx("container", styles.section)}>
          <h2 className={styles.sectionTitle}>Gift guides</h2>
          <p className={styles.sectionLede}>
            Shortlists put together by hand, not by an algorithm reading your last order.
          </p>
          <div className={styles.guideGrid}>
            {guides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        </section>
      )}

      {evergreen.length > 0 && (
        <section className={clsx("container", styles.section)}>
          <h2 className={styles.sectionTitle}>Any time of year</h2>
          <p className={styles.sectionLede}>
            No date attached — a birthday or a thank-you happens when it happens.
          </p>
          <div className={styles.occasionList}>
            {evergreen.map((occasion) => (
              <OccasionCard key={occasion.id} occasion={occasion} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
