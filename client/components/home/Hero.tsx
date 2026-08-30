import { Gift, House, HouseHeart, Soup, Truck } from "lucide-react";
import { SplitPanels } from "./SplitPanels";
import styles from "./Hero.module.css";

/**
 * Home hero — the owner-supplied comp (2026-08-13) laid out around the
 * split landing screen.
 *
 * **The opening screenful is four things: the lockup, the slogan, and
 * the two halves.** The brand block is centred *over the seam* rather
 * than stacked above it, so the first thing on the page is a name with a
 * choice either side of it — and it clears out of the way the moment you
 * lean toward one. That is the whole interaction: the page asks one
 * question, and answering it is a hover.
 *
 * **What the split kept and what it gave up.** The comp's two gold CTA
 * cards are gone; `<SplitPanels>` is both of those things at the size of
 * the decision they are asking about. Everything the comp says in words
 * is untouched: the decorated headline and the four-point promise
 * strip.
 *
 * The strip matters more than it looks: it is what keeps something
 * concrete under a headline as broad as "From home to the world".
 *
 * **The comp's eyebrow and its heart are gone** (owner, 2026-08-29). The
 * line named the three cities over the seam, where it sat across both
 * photographs and had to be read against either of them; the cities are
 * stated in the food half's own copy and in the footer. Dropping it also
 * lets the lockup sit higher and take the whole glow to itself.
 *
 * **"From home to the world"** (owner copy, 2026-08-11) stays the
 * slogan, and still carries both verticals: "home" is where everything
 * is made, "the world" is the gifting half that posts anywhere in India
 * while the food travels the tricity. The treatment is all from the
 * comp: the second line is a gold brush script with a paper-plane
 * doodle, and the "o" of "home" is a pine roundel holding a house mark.
 *
 * **The lockup is the `<h1>`, and the landing page's header is a
 * different object** (owner, 2026-08-27). `HeaderClient` renders no logo
 * on `/` — the brand appears at size exactly once, here — and watches
 * `#hk-hero-brand` to decide when the floating bar turns solid. The
 * image's alt is the heading's accessible name; the slogan is a `<p>`,
 * never an `<h2>` (a tagline heads no section).
 *
 * **The gifts half says "handcrafted", not the comp's "handkrafted".**
 * The brand-K spelling appeared exactly once on the whole site, next to
 * a nav and a /gifts H1 that both spell it with a C — used once, a brand
 * spelling is indistinguishable from a typo (2026-08-13 design review).
 * If the K ever comes back it comes back everywhere.
 *
 * **There is still no trust-stat strip, deliberately.** The promise
 * strip states what the platform does, not numbers nobody can
 * substantiate ("200+ home chefs"). If a figure is ever wanted here,
 * derive it from the catalogue.
 *
 * The slogan keeps a screen-reader copy of the full sentence and hides
 * the decorated spans, because the roundel splits "home" into fragments
 * no one should have to listen to.
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
            {/* `<hgroup>` is the element the HTML spec defines for exactly
                this pair — a heading and the tagline under it. */}
            <hgroup className={styles.brandGroup} id="hk-hero-brand">
              <h1 className={styles.brandHeading}>
                {/* A plain <img>: a fixed vector gains nothing from next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/site/logo.svg"
                  alt="Homekrafted"
                  className={styles.brandMark}
                />
              </h1>
              <p className={styles.heading}>
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
              </p>
            </hgroup>
          </div>
        </div>

        {/*
          The promise strip sits under the split: the two halves have to
          be *in* the first screenful for the page to be asking a
          question, and four points of chrome above them pushed them
          under the fold at 900px.
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
