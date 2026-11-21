import clsx from "clsx";
import { Doors } from "./Doors";
import styles from "./HeroTable.module.css";

/**
 * The page's first screenful and the start of its journey (client change,
 * 2026-11-20): the split — gifts one side, a home kitchen the other — is
 * the hero. The old Diwali hero and the draggable product prints are gone
 * (client, 2026-11-20); the festive edit is one press away under Occasions.
 *
 * Load-bearing ids: `#hk-hero-brand` is what the header's logo handover
 * watches (see `HeaderClient`) — the bar stays transparent with its logo
 * hidden until this wordmark has scrolled past — and `#hk-hero-section`
 * is its fallback target. Drop them and the header never turns solid.
 * The `h1` lives in `Doors`.
 */
export function HeroTable() {
  return (
    <section id="hk-hero-section" className={styles.hero}>
      <div className={clsx("container", styles.stage)}>
        <div id="hk-hero-brand" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG
              wordmark; next/image refuses SVG and the header uses the same
              file the same way. */}
          <img
            src="/images/site/logo.svg"
            alt="Homekrafted"
            width={1381}
            height={789}
            className={styles.brandMark}
          />
        </div>
        <Doors />
      </div>
    </section>
  );
}
