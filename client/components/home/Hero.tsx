"use client";

import Link from "next/link";
import { ArrowRight, House, Sparkles, UtensilsCrossed } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} id="hk-hero-section" aria-label="Welcome to HomeKrafted">
      <div className={styles.splitGrid}>
        {/* ── Left Half: Homemade Food ── */}
        <Link
          href="/shop"
          className={`${styles.panel} ${styles.foodPanel}`}
          aria-label="Order homemade food"
        >
          <div className={styles.imageWrap}>
            <ImageSlot
              ratio="4/5"
              label="Homemade food photograph"
              alt="Artisanal homemade food"
              src="/images/site/split-food.jpg"
              sizes="(max-width: 900px) 100vw, 50vw"
              quality={75}
              className={styles.photo}
              priority
            />
            <div className={styles.scrim} aria-hidden="true" />
          </div>

          <div className={styles.panelFooter}>
            <span className={styles.panelTag}>
              <UtensilsCrossed size={14} className={styles.tagIcon} aria-hidden="true" />
              <span>01 / HOMEMADE FOOD</span>
            </span>
            <span className={styles.panelExplore}>
              <span>Order fresh</span>
              <ArrowRight size={13} className={styles.exploreArrow} aria-hidden="true" />
            </span>
          </div>
        </Link>

        {/* ── Right Half: Handcrafted Gifts ── */}
        <Link
          href="/gifts"
          className={`${styles.panel} ${styles.giftsPanel}`}
          aria-label="Browse handcrafted gifts"
        >
          <div className={styles.imageWrap}>
            <ImageSlot
              ratio="4/5"
              label="Handcrafted gifts photograph"
              alt="Curated handcrafted gifts"
              src="/images/site/split-gifts.jpg"
              sizes="(max-width: 900px) 100vw, 50vw"
              quality={75}
              className={styles.photo}
              priority
            />
            <div className={styles.scrim} aria-hidden="true" />
          </div>

          <div className={styles.panelFooter}>
            <span className={styles.panelTag}>
              <Sparkles size={14} className={styles.tagIcon} aria-hidden="true" />
              <span>02 / HANDCRAFTED GIFTS</span>
            </span>
            <span className={styles.panelExplore}>
              <span>Discover gifts</span>
              <ArrowRight size={13} className={styles.exploreArrow} aria-hidden="true" />
            </span>
          </div>
        </Link>

        {/* ── Centerpiece Overlay (Sitting right over the vertical seam) ── */}
        <div className={styles.centerpiece} id="hk-hero-brand">
          <span className={styles.centerEyebrow}>AUTHENTIC &amp; HANDCRAFTED</span>

          <h1 className={styles.centerHeading}>
            <span className={styles.headingLine}>
              FROM H
              <span className={styles.oHouse}>
                <House strokeWidth={2.4} />
              </span>
              ME
            </span>
            <span className={styles.headingLineWorld}>TO THE WORLD</span>
          </h1>

          <p className={styles.centerSubtitle}>
            Fresh meals from real home kitchens &amp; handcrafted gifts by independent creators.
          </p>

          <div className={styles.ctaGroup}>
            <Link href="/shop" className={styles.shopNowBtn}>
              SHOP NOW
            </Link>
            <div className={styles.dualDirectLinks}>
              <Link href="/shop" className={styles.directLink}>
                Order Food &rarr;
              </Link>
              <span className={styles.directDot}>•</span>
              <Link href="/gifts" className={styles.directLink}>
                Explore Gifts &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
