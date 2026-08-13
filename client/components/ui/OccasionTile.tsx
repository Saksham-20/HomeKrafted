import clsx from "clsx";
import Link from "next/link";
import { CraftIcon, occasionArt } from "@/components/ui/icons/CraftIcon";
import type { Occasion } from "@/lib/types";
import styles from "./OccasionTile.module.css";

export interface OccasionTileProps {
  occasion: Occasion;
  /**
   * Where the tile goes. When set the tile renders as a real `<Link>` —
   * the M22 rule: a card that navigates is a link, not a button. The
   * home page's tiles were `<button>` + `router.push` until M35, which
   * meant no middle-click, no open-in-new-tab and nothing for a crawler
   * to follow, on the eight most prominent links below the hero.
   */
  href?: string;
  /** Button-mode fallback — the primitives gallery, or a future picker context. */
  onClick?: () => void;
  className?: string;
}

/**
 * Occasion tile — a two-tone pine/gold mark over the occasion name.
 *
 * Until M33 this rendered `occasion.initial` inside a gold ring, which on
 * the home page produced a row reading "A B B C D H T W": two of the
 * eight collided (Birthday and Baby Shower), and none of them said
 * anything the label underneath did not already say better. The ring went
 * with the letter — the mark carries the gold now, and stacking a border
 * around it made every tile look like an avatar.
 *
 * The letter is still the fallback, because occasions are admin-editable
 * (`/admin/collections/occasions`) and a slug created next week has no art
 * in `CraftIcon`. An unknown occasion renders exactly what every occasion
 * used to; it never renders an empty tile.
 */
export function OccasionTile({ occasion, href, onClick, className }: OccasionTileProps) {
  const art = occasionArt(occasion.slug);

  const inner = (
    <>
      {art ? (
        <CraftIcon art={art} size={40} className={styles.icon} />
      ) : (
        <span className={styles.ring} aria-hidden="true">
          {occasion.initial}
        </span>
      )}
      <span className={styles.label}>{occasion.name}</span>
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
