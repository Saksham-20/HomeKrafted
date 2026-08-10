import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./Hero.module.css";

/**
 * Home hero.
 *
 * **"Someone's kitchen. Not a cloud kitchen."** (M28, client copy.) The
 * previous line was "Everything homemade" — accurate, and saying nothing
 * a delivery app couldn't also say. What actually separates this platform
 * is *where* the food is made and *how long that takes*, so the headline
 * names the thing it is not, and the lede owns the slowness rather than
 * apologising for it.
 *
 * **The lede has to carry both verticals** (the M20 rule): the site sells
 * food cooked near you *and* craft posted anywhere, and the headline now
 * names only the first. The two CTAs stay side by side and equally
 * weighted for the same reason — that split is load-bearing, so if the
 * headline is ever narrowed further, one of these has to widen.
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
              Someone&rsquo;s kitchen.
              <br />
              <em className={styles.emphasis}>Not a cloud kitchen</em>.
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
