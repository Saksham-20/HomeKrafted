import Link from "next/link";
import { ArrowRight, Gift, HandPlatter, House, HouseHeart, Soup, Truck } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./Hero.module.css";

/**
 * Home hero — rebuilt to the owner-supplied comp (2026-08-13).
 *
 * **"From home to the world"** (owner copy, 2026-08-11) stays the
 * headline, and still carries both verticals: "home" is where everything
 * is made, "the world" is the gifting half that posts anywhere in India
 * while the food travels the tricity. What changed is the treatment, all
 * of it from the comp: the second line is a gold brush script with a
 * paper-plane doodle, the "o" of "home" is a pine roundel holding a house
 * mark, the two CTAs are gold-outlined cards with icons, and a four-point
 * promise strip sits under them (made at home · freshly made everyday ·
 * packed with care · delivered anywhere in India).
 *
 * **The slowness note ("It takes a little longer than a restaurant…") is
 * gone with this redesign** — the comp replaces it with the promise
 * strip, which does the same job of making the broad headline concrete.
 * If the strip ever goes, something concrete has to come back under the
 * lede.
 *
 * **"Handkrafted" in the gifts CTA is the brand spelling from the comp**,
 * not a typo — same K as Homekrafted/HomeKrafter.
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
        <div className={styles.grid}>
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
            <p className={styles.lede}>
              Daily meals, fresh bakes, snacks, sweets and small-batch pickles, made by hand the
              same morning they go out, in home kitchens around the tricity — and handcrafted
              gifts, posted anywhere in India.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/shop" className={styles.ctaCard}>
                <HandPlatter className={styles.ctaIcon} aria-hidden="true" />
                <span className={styles.ctaLabel}>
                  Order
                  <br />
                  homemade food
                </span>
                <span className={styles.ctaArrow} aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
              {/* Two verticals, two buttons, equal weight — the split is
                  the whole message. */}
              <Link href="/gifts" className={styles.ctaCard}>
                <Gift className={styles.ctaIcon} aria-hidden="true" />
                <span className={styles.ctaLabel}>
                  Order
                  <br />
                  handkrafted gifts
                </span>
                <span className={styles.ctaArrow} aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
            </div>
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
          <div className={styles.imageWrap}>
            {/* The home page's LCP element — `priority` so it isn't
                lazy-loaded behind everything below the fold. The wrapper's
                card chrome is stripped and the edges mask-faded in
                Hero.module.css so the photo merges into the cream stage,
                per the comp. */}
            <ImageSlot
              ratio="1/1"
              label="Festive homemade gift hamper"
              alt="A festive gift hamper of homemade sweets, pickles and dry fruit"
              src="/images/site/hero-hamper.jpg"
              size="1200×1200"
              sizes="(max-width: 900px) 100vw, 50vw"
              className={styles.photo}
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
