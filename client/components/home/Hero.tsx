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
        {/* Brand block on top (plain, clean header) */}
        <div className={styles.topBrand}>
          <hgroup className={styles.brandGroup} id="hk-hero-brand">
            <h1 className={styles.brandHeading}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/site/logo.svg"
                alt="Homekrafted"
                className={styles.brandMark}
              />
            </h1>
            <p className={styles.topTagline}>
              Homemade food from trusted home kitchens &amp; handcrafted gifts posted anywhere in India
            </p>
          </hgroup>
        </div>

        <div className={styles.stage}>
          {/* The two halves. Client component with clean hover expansion */}
          <SplitPanels />
        </div>

        {/* The promise strip — trust badges */}
        <ul className={styles.points}>
          <li className={styles.point}>
            <HouseHeart className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>100% Home Kitchens</span>
          </li>
          <li className={styles.point}>
            <Soup className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Fresh &amp; Preservative-Free</span>
          </li>
          <li className={styles.point}>
            <Gift className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Small-Batch &amp; Packed with Care</span>
          </li>
          <li className={styles.point}>
            <Truck className={styles.pointIcon} aria-hidden="true" />
            <span className={styles.pointLabel}>Pan-India Delivery</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

