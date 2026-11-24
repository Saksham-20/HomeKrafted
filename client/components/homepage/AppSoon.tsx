import clsx from "clsx";
import { StoreBadges } from "@/components/ui/StoreBadges";
import styles from "./AppSoon.module.css";

/**
 * "The Homekrafted app — coming soon" (owner, 2026-11-24: a section of its
 * own, not a line in the footer).
 *
 * Built like a store listing — the app's own tile, its name, one line, the
 * two stores — because that is the thing being promised. The tile is the
 * real brand lockup (the icon the app ships with), not a mocked-up phone
 * screen: nothing here shows a screen that does not exist. The store marks
 * are labels until the apps are published (`StoreBadges` with no href says
 * "Coming soon on …"), and the copy claims no date and no feature list.
 */
export function AppSoon() {
  return (
    <section className={styles.section} aria-labelledby="hp-app-title">
      <div className={clsx("container", "container-wide")}>
        <div className={styles.panel}>
          <span className={styles.tile} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup, as in the footer. */}
            <img src="/images/site/logo.svg" alt="" className={styles.logo} />
          </span>
          <div className={styles.copy}>
            <p className={styles.kicker}>Coming soon</p>
            <h2 id="hp-app-title" className={styles.title}>
              The Homekrafted app
            </h2>
            <p className={styles.body}>
              Homemade food, handmade gifts and every order&rsquo;s progress, on iPhone and Android.
              Until it lands, the whole site works in your phone&rsquo;s browser.
            </p>
          </div>
          <StoreBadges variant="solid" className={styles.badges} />
        </div>
      </div>
    </section>
  );
}
