import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import styles from "./InstagramChapter.module.css";

export const INSTAGRAM_URL = "https://instagram.com/_homekrafted";

/**
 * The reels rail's replacement (client request, 2026-11-20): our own
 * Instagram, linked rather than mirrored. A live feed needs an Instagram
 * Graph API token nobody has issued yet, so this is an honest link — it
 * says nothing about what the account currently shows.
 */
export function InstagramChapter() {
  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-insta-title">
      <div className={clsx("container", styles.inner)}>
        <h2 id="lp-insta-title" className={styles.title}>
          See us on <span className={styles.turn}>Instagram.</span>
        </h2>
        <p className={styles.lede}>New makers, new gifts and what&rsquo;s being packed this week.</p>
        <a href={INSTAGRAM_URL} className={styles.link} target="_blank" rel="noopener noreferrer">
          Follow @_homekrafted
          <ArrowUpRight className={styles.icon} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
