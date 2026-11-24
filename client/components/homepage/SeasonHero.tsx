import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Snowfall } from "@/components/season/Snowfall";
import { SnowToggle } from "@/components/season/SnowToggle";
import { SEASON } from "@/lib/season";
import styles from "./SeasonHero.module.css";

/**
 * The opening: the season's name, one sentence of promise, two doors, and
 * a photograph that fades into the paper rather than sitting in a box.
 *
 * `id="hk-hero-section"` is what the header watches to decide when it has
 * scrolled past the hero and should draw its edge shadow.
 */
export function SeasonHero() {
  const { hero } = SEASON;
  return (
    <section id="hk-hero-section" className={styles.hero} aria-labelledby="hp-hero-title">
      <div className={styles.photo}>
        <ImageSlot
          ratio="3/2"
          src={hero.image}
          label="Winter table"
          alt=""
          priority
          sizes="(max-width: 900px) 100vw, 62vw"
          className={styles.photoSlot}
        />
        {/* Inside the photograph, so its fades apply to the snow too and
            it never falls over the headline, side by side or stacked. */}
        {SEASON.theme === "winter" && <Snowfall variant="hero" count={44} seed={2026} />}
      </div>

      <div className={clsx("container", "container-wide", styles.inner)}>
        <div className={styles.copy}>
          <h1 id="hp-hero-title" className={styles.title}>
            {hero.title}
          </h1>
          <p className={styles.body}>{hero.body}</p>
          <div className={styles.actions}>
            <Link href={hero.primary.href} className={clsx(styles.cta, styles.ctaPrimary)}>
              {hero.primary.label}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </Link>
            <Link href={hero.secondary.href} className={clsx(styles.cta, styles.ctaSecondary)}>
              {hero.secondary.label}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {SEASON.theme === "winter" && (
        <div className={styles.snowSwitch}>
          <SnowToggle tone="glass" />
        </div>
      )}
    </section>
  );
}
