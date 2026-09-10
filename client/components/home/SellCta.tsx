import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./SellCta.module.css";

export function SellCta() {
  return (
    <section className={styles.band} aria-labelledby="sell-heading">
      <div className={styles.glowAura} aria-hidden="true" />
      <div className={styles.body}>
        <span className={styles.eyebrow}>Cook, bake, or make things</span>
        <h2 id="sell-heading" className={styles.title}>
          Your kitchen is already a business. Give it a storefront.
        </h2>
        <p className={styles.blurb}>
          Homekrafted is where passionate home cooks and independent artisans sell what they make at
          home. You keep your own page, your own reviews and your own prices —
          and you see exactly what lands in your wallet before you list a single thing.
        </p>
      </div>

      <div className={styles.actions}>
        <div className={styles.avatarCluster} aria-hidden="true">
          <div className={styles.avatar}>A</div>
          <div className={`${styles.avatar} ${styles.avatar2}`}>S</div>
          <div className={`${styles.avatar} ${styles.avatar3}`}>P</div>
          <span className={styles.avatarText}>Join 200+ HomeKrafters</span>
        </div>

        <Link href="/sell" className={styles.cta}>
          <span>Start selling</span>
          <ArrowRight className={styles.ctaIcon} aria-hidden="true" />
        </Link>
        <Link href="/about" className={styles.link}>
          How Homekrafted works →
        </Link>
      </div>
    </section>
  );
}
