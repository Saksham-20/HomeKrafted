import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
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
 * One kitchen on the home page's "Meet the Hands Behind the Flavours" rail.
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
 */
export function MakerCard({ vendor, bestseller, bestsellerPrice }: MakerCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.avatarWrap}>
        <ImageSlot
          ratio="1/1"
          shape="circle"
          label={vendor.avatarPlaceholder}
          alt={`${vendor.name}, a home kitchen in ${vendor.location}`}
          src={vendor.avatarSrc}
          sizes="88px"
          compact
        />
      </div>

      <h3 className={styles.name}>{vendor.name}</h3>
      <p className={styles.location}>{vendor.location}</p>
      <p className={styles.story}>{vendor.bio}</p>

      {bestseller ? (
        <p className={styles.bestseller}>
          <span className={styles.bestsellerLabel}>Their bestseller</span>
          <span className={styles.bestsellerName}>{bestseller.name}</span>
          {bestsellerPrice !== undefined && (
            <span className={styles.bestsellerPrice}>{formatCurrency(bestsellerPrice)}</span>
          )}
        </p>
      ) : (
        // A kitchen approved this morning has nothing listed yet. Say so
        // plainly rather than rendering an empty slot — the same rule M16
        // set for an empty HomeKrafter profile: a shorter card, not a
        // broken one.
        <p className={styles.bestsellerEmpty}>Their first listings are on the way.</p>
      )}

      <Link href={`/storefront/${vendor.slug}`} className={styles.cta}>
        Explore {vendor.name} →
      </Link>
    </article>
  );
}
