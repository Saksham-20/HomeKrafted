import clsx from "clsx";
import { StoreBadges } from "@/components/ui/StoreBadges";
import styles from "./AppSoon.module.css";

/**
 * The native apps are not published, so the store marks are labels, not
 * links (`StoreBadges` with no href says "Coming soon on …"). Nothing here
 * claims a date, a feature list or a download.
 */
export function AppSoon() {
  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-app-title">
      <div className={clsx("container", styles.inner)}>
        <div className={styles.copy}>
          <h2 id="lp-app-title" className={styles.title}>
            Homekrafted app,{" "}
            <span className={styles.soon}>coming soon.</span>
          </h2>
          <p className={styles.lede}>
            The iOS and Android apps are on the way. Until then the whole site works in your
            phone&rsquo;s browser, with order status updates.
          </p>
          <StoreBadges variant="solid" />
        </div>
        <div className={styles.phone} aria-hidden="true">
          <span className={styles.notch} />
          <span className={styles.screen}>
            <span className={styles.bar} />
            <span className={styles.bar} />
            <span className={clsx(styles.bar, styles.barShort)} />
            <span className={styles.tiles}>
              <span />
              <span />
            </span>
            <span className={styles.stamp}>Coming soon</span>
          </span>
        </div>
      </div>
    </section>
  );
}
