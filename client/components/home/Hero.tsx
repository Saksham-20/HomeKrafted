import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { TrustStat } from "@/lib/data";
import { getFeatures } from "@/lib/features/server";
import styles from "./Hero.module.css";

export interface HeroProps {
  trustStats: TrustStat[];
}

/**
 * Home hero.
 *
 * Rewritten to say plainly what this is: **real home kitchens near you,
 * cooking real food.** The previous copy ("Made with love, gifted from the
 * heart", "pickles, bakes and curated hampers") read as a gifting site, and
 * a visitor could get all the way down the page without learning that daily
 * home-cooked food is the main event or that everything is local to the
 * tricity.
 */
export async function Hero({ trustStats }: HeroProps) {
  const features = await getFeatures();

  return (
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>Home kitchens · Chandigarh, Mohali &amp; Panchkula</span>
            <h1 className={styles.heading}>
              Real <em className={styles.emphasis}>home food</em>,
              <br />
              cooked near you.
            </h1>
            <p className={styles.lede}>
              Daily meals, fresh bakes, snacks, sweets and small-batch pickles — made this morning
              in home kitchens around the tricity, by people who cook for their own families too.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/shop" className={styles.ctaPrimary}>
                Order home food near you
              </Link>
              {/* Still links to /hamper while the builder is held — that route
                  serves <HamperComingSoon>, so the CTA lands somewhere real. */}
              <Link href="/hamper" className={styles.ctaOutline}>
                {features.hamperBuilder ? "Build a hamper →" : "Build a hamper · coming soon →"}
              </Link>
            </div>
            <div className={styles.trustRow}>
              {trustStats.map((stat) => (
                <div key={stat.label} className={styles.trustStat}>
                  <span className={styles.trustValue}>{stat.value}</span>
                  <span className={styles.trustLabel}>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.imageWrap}>
            {/* The home page's LCP element — `priority` so it isn't
                lazy-loaded behind everything below the fold. */}
            <ImageSlot
              ratio="1/1"
              label="Festive homemade gift hamper"
              alt="A festive gift hamper of homemade sweets, pickles and dry fruit"
              src="/images/site/hero-hamper.jpg"
              size="1200×1200"
              sizes="(max-width: 900px) 100vw, 500px"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
