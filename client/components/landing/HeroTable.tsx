import clsx from "clsx";
import { Doors } from "./Doors";
import styles from "./HeroTable.module.css";

/**
 * The page's first screenful and the start of its journey (client change,
 * 2026-11-20): the split — gifts one side, a home kitchen the other — is
 * the hero. The old Diwali hero and the draggable product prints are gone
 * (client, 2026-11-20); the festive edit is one press away under Occasions.
 *
 * Load-bearing ids: `#hk-hero-brand` is the marker the header watches
 * (see `HeaderClient`) — the bar stays transparent until it has scrolled
 * under the bar — and `#hk-hero-section` is its fallback target. Drop them
 * and the header never turns solid. The logo is always in the bar.
 * The `h1` lives in `Doors`.
 */
export function HeroTable() {
  return (
    <section id="hk-hero-section" className={styles.hero}>
      <div className={clsx("container", styles.stage)}>
        {/* Zero-height marker: once it passes under the bar, the bar turns
            solid. The logo itself lives in the bar from first paint
            (owner, 2026-11-21). */}
        <span id="hk-hero-brand" className={styles.marker} aria-hidden="true" />
        <Doors />
      </div>
    </section>
  );
}
