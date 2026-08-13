import clsx from "clsx";
import { CraftIcon, occasionArt } from "@/components/ui/icons/CraftIcon";
import type { Occasion } from "@/lib/types";
import styles from "./OccasionTile.module.css";

export interface OccasionTileProps {
  occasion: Occasion;
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
export function OccasionTile({ occasion, onClick, className }: OccasionTileProps) {
  const art = occasionArt(occasion.slug);

  return (
    <button
      type="button"
      className={clsx(styles.tile, className)}
      onClick={onClick}
    >
      {art ? (
        <CraftIcon art={art} size={40} className={styles.icon} />
      ) : (
        <span className={styles.ring} aria-hidden="true">
          {occasion.initial}
        </span>
      )}
      <span className={styles.label}>{occasion.name}</span>
    </button>
  );
}
