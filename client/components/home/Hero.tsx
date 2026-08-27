import { Gift, House, HouseHeart, Soup, Truck } from "lucide-react";
import { SplitPanels } from "./SplitPanels";
import styles from "./Hero.module.css";

/**
 * Home hero — the owner-supplied comp (2026-08-13), re-laid out around
 * the split landing screen (M51).
 *
 * **The opening screenful is four things (owner instruction, 2026-08-27):
 * the lockup, the slogan, and the two panels.** The lockup moved here from
 * the header (which went compact the same day) so the brand appears at
 * size exactly once, centred above the slogan. The lede paragraph was cut
 * — its whole sentence ("food cooked nearby, gifts posted anywhere") is
 * already on the two panels' own blurbs, and three lines of copy above
 * the split were what pushed the choice below the fold. If the panels
 * ever lose their blurbs, a sentence has to come back here.
 *
 * **What M51 changed and what it kept.** The two gold CTA cards and the
 * hamper photograph are gone from here; `<SplitPanels>` is both of those
 * things at the size of the decision they are asking about — half a
 * screen each, photographed, and the one you lean toward opens to about
 * three quarters. Everything the comp says in words is untouched and
 * simply centred over it: the eyebrow and its heart, the decorated
 * headline, the lede, and the four-point promise strip.
 *
 * The strip matters more than it looks: it is what keeps something
 * concrete under a headline as broad as "From home to the world", and the
 * note below is the standing rule about it.
 *
 * **"From home to the world"** (owner copy, 2026-08-11) stays the
 * headline, and still carries both verticals: "home" is where everything
 * is made, "the world" is the gifting half that posts anywhere in India
 * while the food travels the tricity. What changed is the treatment, all
 * of it from the comp: the second line is a gold brush script with a
 * paper-plane doodle, the "o" of "home" is a pine roundel holding a house
 * mark, and a four-point promise strip states what the platform does
 * (made at home · freshly made everyday · packed with care · delivered
 * anywhere in India). The comp's two gold CTA cards became the split
 * panels in M51 — same two destinations, at the size of the choice.
 *
 * **The slowness note ("It takes a little longer than a restaurant…") is
 * gone with this redesign** — the comp replaces it with the promise
 * strip, which does the same job of making the broad headline concrete.
 * If the strip ever goes, something concrete has to come back under the
 * lede.
 *
 * **The gifts half says "handcrafted", not the comp's "handkrafted".** The
 * brand-K spelling appeared exactly once on the whole site, next to a nav
 * and a /gifts H1 that both spell it with a C — used once, a brand
 * spelling is indistinguishable from a typo (2026-08-13 design review,
 * cross-model). If the K ever comes back it comes back everywhere.
 *
 * **There is still no trust-stat strip, deliberately.** The promise strip
 * states what the platform does (made at home, packed with care), not
 * numbers nobody can substantiate ("200+ home chefs"). If a figure is
 * ever wanted here, derive it from the catalogue.
 *
 * The heading keeps a screen-reader copy of the full sentence and hides
 * the decorated spans, because the roundel splits "home" into fragments
 * no one should have to listen to.
 */
export function Hero() {
  return (
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.inner}>
          <div className={styles.copy}>
            {/* Grouped so the heart centres on the eyebrow rather than on
                the column — see `.eyebrowGroup`. */}
            <span className={styles.eyebrowGroup}>
              <span className={styles.eyebrow}>
                Home kitchens &bull; Chandigarh, Mohali &amp; Panchkula
              </span>
              {/* Small gold heart under the eyebrow — decoration from the comp. */}
              <svg
                className={styles.heart}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M12 21c-4.8-3.5-8.6-6.8-9.8-10A5.6 5.6 0 0 1 7.4 3.6c1.9 0 3.6 1 4.6 2.6a5.4 5.4 0 0 1 4.6-2.6 5.6 5.6 0 0 1 5.2 7.4C20.6 14.2 16.8 17.5 12 21Z" />
              </svg>
            </span>
            {/*
              The brand lockup, centred above the slogan (owner instruction,
              2026-08-27). This is the page's one brand moment — the header
              shrank to a 40px wayfinding mark the same day, so the lockup
              appears at size exactly once. A plain <img> for the same
              reason as the header's: a fixed vector gains nothing from
              next/image.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.brandMark} />
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
          </div>

          {/* The two halves. A client component — it reads the pointer,
              focus and, on a touch screen, which half the scroll is
              showing. See `SplitPanels.tsx`. */}
          <SplitPanels />

          {/*
            The promise strip sits under the split now, not under the
            lede: the two halves have to be *in* the first screenful for
            the page to be asking a question, and four points of chrome
            above them pushed them under the fold at 900px.
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
      </div>
    </section>
  );
}
