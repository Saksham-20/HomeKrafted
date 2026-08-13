import clsx from "clsx";
import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { CraftIcon, categoryArt, giftArt } from "@/components/ui/icons/CraftIcon";
import type { Category } from "@/lib/types";
import styles from "./CategoryTile.module.css";

export interface CategoryTileProps {
  category: Category;
  /**
   * Where the tile goes. When set the tile renders as a real `<Link>` —
   * the M22 rule: a card that navigates is a link, not a button. See
   * `OccasionTile` for the M35 history.
   */
  href?: string;
  /** Button-mode fallback — the primitives gallery, or a future picker context. */
  onClick?: () => void;
  className?: string;
}

/**
 * Category tile — circular 1:1 photo + label, ported from "Shop by
 * category".
 *
 * **A category with no photograph draws a mark instead (M33).** The four
 * craft categories seeded in M22 (`candles-home`, `handmade-jewellery`,
 * `art-prints`, `personalised-gifts`) have no `imageSrc`, so this rendered
 * `ImageSlot`'s diagonal-hatch placeholder: a near-invisible circle with a
 * 10px grey filename caption in the middle of it, four of them in a row
 * under eight real photographs. It looked like the page had failed to
 * load, and it was the entire non-food half of the marketplace that
 * looked that way.
 *
 * The mark is not a stand-in for a photo that is coming — a real
 * photograph still wins the moment one exists, because `imageSrc` is
 * checked first and nothing else changes. It is what the tile shows when
 * there is honestly nothing to show, and `CLAUDE.md` rules out the two
 * shortcuts: no generated imagery, and no stock photograph of a product
 * nobody here is selling.
 *
 * `ImageSlot`'s own placeholder is deliberately left alone — it is the
 * right thing in a seller-portal upload slot, where the hatch reads as
 * "this is where your photo goes". This is a shopfront.
 */
export function CategoryTile({ category, href, onClick, className }: CategoryTileProps) {
  const inner = (
    <>
      {category.imageSrc ? (
        <ImageSlot
          ratio="1/1"
          shape="circle"
          label={category.imagePlaceholder}
          // The category name is rendered right below, so the tile art is
          // decoration rather than something to announce twice.
          alt=""
          src={category.imageSrc}
          sizes="120px"
          compact
        />
      ) : (
        <span className={styles.mark}>
          <CraftIcon art={categoryArt(category.slug) ?? giftArt} size={46} />
        </span>
      )}
      <span className={styles.label}>{category.name}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={clsx(styles.tile, className)}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={clsx(styles.tile, className)} onClick={onClick}>
      {inner}
    </button>
  );
}
