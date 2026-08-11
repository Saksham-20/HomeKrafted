import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./Hero.module.css";

/**
 * Home hero.
 *
 * **"From home to the world"** (owner copy, 2026-08-11). It replaces
 * M28's "Someone's kitchen. Not a cloud kitchen.", which replaced
 * "Everything homemade" before that. Worth knowing what each was for, so
 * the next edit does not lose it: "Everything homemade" said nothing a
 * delivery app couldn't also say; M28's line fixed that by naming the
 * thing this is *not*.
 *
 * This one does something the previous two could not — it **carries both
 * verticals in the headline itself**. "Home" is where everything here is
 * made, food and craft alike, and "the world" is the gifting half, which
 * posts anywhere in India while the food travels only around the tricity.
 * That was the M20 rule the lede had been carrying alone, because the
 * headline named food only.
 *
 * Two things it gives up, both deliberate and both now the lede's job: it
 * no longer names the cloud-kitchen contrast, and it no longer sets up the
 * slowness that the note below owns ("It takes a little longer than a
 * restaurant"). Keep that note — a headline this broad needs the concrete
 * lines under it more, not less. The two CTAs stay side by side and
 * equally weighted for the same reason as before: the split is the
 * message.
 *
 * **There is no trust-stat strip, deliberately.** It read "200+ home
 * chefs · 0 preservatives · 48 hr freshly made" — a SaaS trust bar whose
 * first figure nobody could substantiate and whose third contradicted the
 * announcement bar's "cooked this morning" two rows above it. A claim that
 * cannot be checked is worse than no claim on a page whose entire pitch is
 * that you can trust a stranger's kitchen. Don't reintroduce one; if a
 * number is ever wanted here, derive it from the catalogue.
 */
export function Hero() {
  return (
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>Home kitchens · Chandigarh, Mohali &amp; Panchkula</span>
            <h1 className={styles.heading}>
              From home
              <br />
              <em className={styles.emphasis}>to the world</em>
            </h1>
            <p className={styles.lede}>
              Daily meals, fresh bakes, snacks, sweets and small-batch pickles, made by hand the
              same morning they go out, in home kitchens around the tricity — and handcrafted
              gifts, posted anywhere in India.
            </p>
            <p className={styles.note}>
              It takes a little longer than a restaurant. That&rsquo;s kind of the point.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/shop" className={styles.ctaPrimary}>
                Order homemade food
              </Link>
              {/* Two verticals, two buttons, equal weight — the split is
                  the whole message. */}
              <Link href="/gifts" className={styles.ctaOutline}>
                Order handcrafted gifts →
              </Link>
            </div>
          </div>
          <div className={styles.imageWrap}>
            {/* The home page's LCP element — `priority` so it isn't
                lazy-loaded behind everything below the fold. */}
            <ImageSlot
              ratio="1/1"
              label="Festive homemade gift hamper"
              alt="A festive gift hamper of homemade sweets, pickles and dry fruit"
              src="/images/site/hero-hamper.jpg"
              size="1200×1200"
              sizes="(max-width: 900px) 100vw, 500px"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
