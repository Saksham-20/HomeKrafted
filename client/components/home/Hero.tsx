import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { TrustStat } from "@/lib/data";
import styles from "./Hero.module.css";

export interface HeroProps {
  trustStats: TrustStat[];
}

/**
 * Home hero.
 *
 * **"Everything homemade"** (M20, client copy). The line does the work the
 * previous one couldn't: the site now sells two different things — food
 * cooked near you, and craft posted anywhere — and any headline naming only
 * one of them misdescribes half the catalogue.
 *
 * The two CTAs are the two verticals, side by side and equally weighted,
 * because the split is the point. The eyebrow still says tricity, since
 * that is true of the food and is the thing a first-time visitor most needs
 * to know before browsing.
 */
export function Hero({ trustStats }: HeroProps) {
  return (
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>Home kitchens · Chandigarh, Mohali &amp; Panchkula</span>
            <h1 className={styles.heading}>
              Everything
              <br />
              <em className={styles.emphasis}>homemade</em>.
            </h1>
            <p className={styles.lede}>
              Daily meals, fresh bakes, snacks, sweets and small-batch pickles from home kitchens
              around the tricity — and handcrafted gifts, posted anywhere in India.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/shop" className={styles.ctaPrimary}>
                Order homemade food
              </Link>
              {/* Two verticals, two buttons, equal weight — the split is
                  the whole message. */}
              <Link href="/gifts" className={styles.ctaOutline}>
                Order handkrafted gifts →
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
