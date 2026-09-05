import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { MakerPortrait } from "@/components/vendor/MakerPortrait";
import { formatCurrency } from "@/lib/format";
import type { Product, Vendor } from "@/lib/types";
import styles from "./MakerCard.module.css";

export interface MakerCardProps {
  vendor: Vendor;
  /** Their best-rated available listing. Absent for a kitchen with nothing live yet. */
  bestseller?: Product;
  /** Price of `bestseller`'s default weight option, already resolved by the caller. */
  bestsellerPrice?: number;
}

/**
 * One kitchen on the home page's "The hands behind it all" rail (renamed
 * from "Meet the Hands Behind the Flavours" — "flavours" was food-biased
 * over a maker set that includes craft sellers, the M28 parity rule).
 *
 * This replaced a rail of *products* with a rail of *people* (M20, client
 * copy). That is the whole point of the change: on a platform whose thesis
 * is trusting a stranger's kitchen, the cook is more persuasive than the
 * jar, and the previous rail never showed one.
 *
 * `bio` is the story rather than `VendorProfile.story`: the profile is a
 * separate 1:1 fetch per vendor (M16 keeps it off `Vendor` precisely
 * because listing queries don't need it), and four extra round trips to
 * render four cards is not worth a slightly longer sentence.
 *
 * **Four things were quieted down when the mark landed.** The card was
 * carrying gold on the bestseller eyebrow and terracotta on its price —
 * two accent colours competing inside 300 pixels, above a pine link, over
 * a repeated stock photograph. The eyebrow and price are now ink; the
 * only colour left on the card is the link, and the mark's wash. The
 * location dropped its uppercase mono, which shouted a street address
 * louder than the kitchen's name. Terracotta prices remain the rule on
 * *product* cards, where the price is the thing being decided on; here it
 * is a footnote about one listing.
 */
export function MakerCard({ vendor, bestseller, bestsellerPrice }: MakerCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        {/* 96px, up from the 68px default (owner, 2026-09-05: "increase
            the size of the images under chefs"). This section's whole
            claim is that a real person cooked it, and the person was the
            smallest thing on the card — smaller than the dish thumbnail
            below them. The card grew with `container-wide`, so the
            portrait grows into the room rather than at the copy's
            expense; `.head`'s `min-height` moves with it. */}
        <MakerPortrait vendor={vendor} size={96} />
        <div className={styles.who}>
          <h3 className={styles.name}>{vendor.name}</h3>
          <p className={styles.location}>{vendor.location}</p>
        </div>
      </div>

      <p className={styles.bio}>{vendor.bio}</p>

      {bestseller ? (
        /*
          The bestseller shows its photograph now, not only its name. The
          card is an argument that a real person makes real things, and it
          was making it entirely in words: a kitchen's single best listing
          is the most persuasive thing it owns, and it was rendering as a
          15px line of text.

          `ImageSlot` handles both halves — a bundled or uploaded photo,
          or the hatch placeholder for a kitchen that has not added one.
          `alt=""` because the product's name is the very next node
          (`ImageSlot`'s own rule), and `sizes` because this is a 104px
          thumbnail, not a grid card: without it the browser downloads a
          viewport-wide image to fill it.
        */
        /* A `<div>`, not a `<p>`: `ImageSlot` renders a `<div>`, and a
           block element inside a paragraph is invalid HTML — the browser
           closes the `<p>` early, so the server and client trees differ
           and React throws a hydration error. */
        <div className={styles.pick}>
          {/* Highest-rated, not most-sold — nothing here counts sales, and a
              "bestseller" with no sales behind it is a claim (M52). */}
          <span className={styles.pickLabel}>Their top-rated</span>
          <span className={styles.pickRow}>
            {/* 104px since 2026-09-05 — see `.pickThumb`. */}
            <span className={styles.pickThumb}>
              <ImageSlot
                ratio="1/1"
                shape="square"
                compact
                label={bestseller.images[0]?.placeholder ?? bestseller.name}
                src={bestseller.images[0]?.src}
                alt=""
                sizes="104px"
              />
            </span>
            <span className={styles.pickName}>{bestseller.name}</span>
            {bestsellerPrice !== undefined && (
              <span className={styles.pickPrice}>{formatCurrency(bestsellerPrice)}</span>
            )}
          </span>
        </div>
      ) : (
        // A kitchen approved this morning has nothing listed yet. Say so
        // plainly rather than rendering an empty slot — the same rule M16
        // set for an empty HomeKrafter profile: a shorter card, not a
        // broken one.
        <p className={styles.pickEmpty}>Their first listings are on the way.</p>
      )}

      {/*
        "See what they make" rather than "See their menu": one rail carries
        food kitchens and craft sellers since M20, and a menu is something
        only half of them have. Same reason the section stopped saying
        "flavours" in M28.

        A stretched link — its `::after` covers the card — so the whole
        surface is the target and the destination is still a real URL.
        Nothing else in the card is interactive, so there is nothing for
        the overlay to swallow.
      */}
      <Link href={`/storefront/${vendor.slug}`} className={styles.cta}>
        See what they make <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
