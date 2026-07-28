import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { TrustStat } from "@/lib/data";
import { isHamperBuilderLive } from "@/lib/features";
import styles from "./Hero.module.css";

export interface HeroProps {
  trustStats: TrustStat[];
}

/** Home hero — ported from the prototype's store-first hero: headline, CTAs, trust stats, hero ImageSlot. */
export function Hero({ trustStats }: HeroProps) {
  return (
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>Handmade gifts · Homemade goodness</span>
            <h1 className={styles.heading}>
              Made with love,
              <br />
              <em className={styles.emphasis}>gifted</em> from the heart.
            </h1>
            <p className={styles.lede}>
              Small-batch pickles, bakes and curated hampers from real home kitchens — thoughtfully
              packed for every occasion.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/shop" className={styles.ctaPrimary}>
                Shop homemade foods
              </Link>
              {/* Still links to /hamper while the builder is held — that route
                  serves <HamperComingSoon>, so the CTA lands somewhere real. */}
              <Link href="/hamper" className={styles.ctaOutline}>
                {isHamperBuilderLive() ? "Build a hamper →" : "Build a hamper · coming soon →"}
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
            <ImageSlot
              ratio="1/1"
              label="Festive homemade gift hamper"
              src="/images/site/hero-hamper.jpg"
              size="1200×1200"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
