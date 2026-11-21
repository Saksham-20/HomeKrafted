import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import styles from "./SellCover.module.css";

/**
 * The supply-side pitch, as the page's closing sheet (the app note moved to
 * `AppSoon`).
 * Nothing here promises zero commission or an approval time — a person
 * works the application queue, and commission is a business switch.
 */
export function SellCover() {
  return (
    <section className={styles.cover} aria-labelledby="lp-sell-title">
      <div className={clsx("container", styles.inner)}>
        <h2 id="lp-sell-title" className={styles.title}>
          <span className={styles.titleLine}>Your kitchen is</span>
          <span className={clsx(styles.titleLine, styles.titleTwo)}>already a business.</span>
        </h2>
        <div className={styles.side}>
          <p className={styles.blurb}>
            Give it a storefront. Homekrafted is where home cooks and independent artisans sell what
            they make at home — your own page, your own reviews, your own prices, and you see
            exactly what lands in your wallet before you list a single thing.
          </p>
          <div className={styles.actions}>
            <Link href="/sell" className={styles.cta}>
              Start selling
              <ArrowRight className={styles.ctaIcon} aria-hidden="true" />
            </Link>
            <Link href="/about" className={styles.link}>
              How Homekrafted works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
