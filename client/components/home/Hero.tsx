import { Gift, House, HouseHeart, Soup, Truck } from "lucide-react";
import { SplitPanels } from "./SplitPanels";
import styles from "./Hero.module.css";

/**
 * Home hero — split landing screen with interactive food and craft panels.
 *
 * The brand logo is kept permanently in the top navbar.
 * Over the seam sits the slogan "From home to the world" with festive comp doodles.
 */
export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.stage}>
          {/* The two halves. A client component — it reads the pointer and
              focus, and its `data-active` is what the brand block below
              is watching through `:has()`. */}
          <SplitPanels />

          {/*
            The brand block, centred over the seam and inert: it must
            never intercept the pointer, or the middle of the screen
            would be a dead zone between the two things the page is
            asking about.
          */}
          <div className={styles.brand}>
            <hgroup className={styles.brandGroup} id="hk-hero-brand">
              <h1 className={styles.heading}>
                <span className="hk-sr-only">From home to the world</span>
                <span aria-hidden="true" className={styles.headingLine}>
                  {/* Sparkle dashes at the left of "From" — comp doodle. */}
                  <svg
                    className={styles.sparks}
                    viewBox="0 0 34 34"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M17 4v9M7 9l6 6M27 9l-6 6" />
                  </svg>
                  From h
                  <span className={styles.oHouse}>
                    <House strokeWidth={2.4} />
                  </span>
                  me
                </span>
                <span aria-hidden="true" className={styles.scriptRow}>
                  <span className={styles.script}>to the world</span>
                  {/* Paper plane + dashed flight trail — comp doodle. */}
                  <svg
                    className={styles.plane}
                    viewBox="0 0 128 74"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      className={styles.planeTrail}
                      d="M4 68c26 6 56 4 74-10 12-9 17-18 21-28"
                    />
                    <path
                      className={styles.planeBody}
                      d="M96 30 124 8l-12 30-6-10Zm16-12-16 12m10 8-4 8"
                    />
                  </svg>
                </span>
              </h1>
            </hgroup>
          </div>
        </div>

        {/*
          The promise strip sits under the split: the two halves have to
          be *in* the first screenful for the page to be asking a
          question.
        */}
        <ul className={styles.points}>
          <li className={styles.point}>
            <HouseHeart className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Made at home</span>
          </li>
          <li className={styles.point}>
            <Soup className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Freshly made everyday</span>
          </li>
          <li className={styles.point}>
            <Gift className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Packed with care</span>
          </li>
          <li className={styles.point}>
            <Truck className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Delivered anywhere in India</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

