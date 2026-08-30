import Link from "next/link";
import { Star } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { MakerPortrait } from "@/components/vendor/MakerPortrait";
import { formatCurrency } from "@/lib/format";
import { listingPrice, type Kitchen } from "@/lib/kitchens";
import styles from "./KitchenCard.module.css";

/** How many dishes preview on the card. Four fills the row at every width this grid reaches. */
const PREVIEW_DISHES = 4;

export interface KitchenCardProps {
  kitchen: Kitchen;
  /** Forwarded to the first preview thumbnail of the first card only. */
  priority?: boolean;
}

/**
 * One home kitchen on `/shop` — who cooks, what they cook, and four of
 * the things they have live (M51).
 *
 * **It shows the catalogue, not just the cook.** A card that only
 * introduced somebody would be a directory entry: a buyer arriving hungry
 * would have to open a storefront to find out whether this kitchen sells
 * anything they want. The four dishes are real links to real listings, so
 * the shortest path from the food page to a product page is still one
 * click, exactly as it was when this page was a dish grid.
 *
 * The details are the ones that decide an order and nothing else: how far
 * away they are, what they mostly make, whether it is all vegetarian, what
 * the cheapest thing costs. Prep time and working days are deliberately
 * absent — they live on `VendorProfile`, which is a separate fetch per
 * kitchen (M16 keeps it off `Vendor` precisely so listing queries stay
 * cheap), and twenty extra round trips to render twenty cards is not a
 * trade worth making.
 *
 * `MakerPortrait`, never `vendor.avatarSrc` — pre-M28 rows still hold a
 * shared stock photograph of one woman, and this is a grid where that
 * would render as several different kitchens with the same face.
 */
export function KitchenCard({ kitchen, priority }: KitchenCardProps) {
  const { vendor, dishes, distanceLabel, fromPrice, makes, allVegetarian } = kitchen;
  const preview = dishes.slice(0, PREVIEW_DISHES);
  const rated = vendor.reviewCount > 0;

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        {/* `alt=""` — the kitchen's name is the very next node. */}
        <MakerPortrait vendor={vendor} size={56} alt="" />
        <div className={styles.who}>
          <h2 className={styles.name}>
            <Link href={`/storefront/${vendor.slug}`} className={styles.nameLink}>
              {vendor.name}
            </Link>
          </h2>
          <p className={styles.where}>
            {vendor.location}
            {/* Absent means "we were not told where you are", not "far" —
                so nothing is said rather than a distance being invented. */}
            {distanceLabel && <span className={styles.distance}> · {distanceLabel} away</span>}
          </p>
        </div>
        {rated ? (
          <p className={styles.rating}>
            <Star className={styles.star} aria-hidden="true" />
            {/* The star is decoration; the sentence is what a screen
                reader gets, because "4.9 (204)" on its own is a number
                pair with no units. */}
            <span className="hk-sr-only">
              Rated {vendor.rating.toFixed(1)} out of 5 from {vendor.reviewCount} reviews
            </span>
            <span className={styles.ratingValue} aria-hidden="true">
              {vendor.rating.toFixed(1)}
            </span>
            <span className={styles.ratingCount} aria-hidden="true">
              ({vendor.reviewCount})
            </span>
          </p>
        ) : (
          // A kitchen approved this morning has no reviews. "New kitchen"
          // is the true statement; a 0.0 out of five is not.
          <p className={styles.newBadge}>New kitchen</p>
        )}
      </div>

      <p className={styles.bio}>{vendor.bio}</p>

      <ul className={styles.tags}>
        {allVegetarian && (
          <li className={styles.tagVeg}>
            <span className={styles.vegDot} aria-hidden="true" />
            Pure veg
          </li>
        )}
        {makes.map((label) => (
          <li key={label} className={styles.tag}>
            {label}
          </li>
        ))}
        {vendor.discount && (
          <li className={styles.tagSale}>{vendor.discount.pct}% off everything</li>
        )}
      </ul>

      <p className={styles.stats}>
        {dishes.length} {dishes.length === 1 ? "dish" : "dishes"}
        {fromPrice !== undefined && <> · from {formatCurrency(fromPrice)}</>}
      </p>

      <ul className={styles.dishes}>
        {preview.map((dish, index) => (
          <li key={dish.id} className={styles.dish}>
            <Link href={`/product/${dish.slug}`} className={styles.dishLink}>
              <span className={styles.dishThumb}>
                <ImageSlot
                  ratio="1/1"
                  shape="square"
                  compact
                  label={dish.images[0]?.placeholder ?? dish.name}
                  src={dish.images[0]?.src}
                  alt=""
                  sizes="(max-width: 640px) 40vw, 150px"
                  priority={priority && index === 0}
                />
              </span>
              <span className={styles.dishName}>{dish.name}</span>
              <span className={styles.dishPrice}>{formatCurrency(listingPrice(dish))}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        No stretched link on this card, unlike `ProductCard`: the dish
        thumbnails are links of their own, and an overlay covering the card
        would swallow every one of them.
      */}
      <Link href={`/storefront/${vendor.slug}`} className={styles.cta}>
        See their full menu
        <span aria-hidden="true"> →</span>
        <span className="hk-sr-only"> from {vendor.name}</span>
      </Link>
    </article>
  );
}
